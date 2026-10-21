import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { zonedToIso } from "@/lib/domain/hr";
import { sectorConfig } from "@/config/sector.config";

type Db = SupabaseClient<Database>;

/** Libellés métier des tables auditées et lien vers la fiche. */
export const AUDITED: Record<string, { label: string; href?: (id: string) => string }> = {
  invoices: { label: "Facture", href: (id) => `/finance/invoices/${id}` },
  payments: { label: "Paiement" },
  quotes: { label: "Devis", href: (id) => `/crm/quotes/${id}` },
  deals: { label: "Affaire", href: () => "/crm/pipeline" },
  clients: { label: "Client", href: (id) => `/crm/clients/${id}` },
  work_orders: { label: "Dossier (OF)", href: (id) => `/ops/work-orders/${id}` },
  purchase_orders: { label: "Commande fournisseur", href: (id) => `/resources/purchase-orders/${id}` },
  assets: { label: "Équipement", href: (id) => `/resources/equipment/${id}` },
  map_objects: { label: "Plan (objet de la Map)" },
  employees: { label: "Salarié", href: (id) => `/hr/employees/${id}` },
  employee_salaries: { label: "Rémunération" },
  leave_requests: { label: "Congé", href: () => "/hr/leaves" },
  badge_events: { label: "Pointage", href: () => "/hr/presence" },
  expenses: { label: "Note de frais" },
  documents: { label: "Document", href: () => "/comms/documents" },
  profiles: { label: "Compte utilisateur" },
  roles: { label: "Rôle" },
  permissions: { label: "Droit d'accès" },
};

export const ACTIONS: Record<string, string> = { INSERT: "Création", UPDATE: "Modification", DELETE: "Suppression" };

/** Nom lisible de l'entité à partir de la ligne auditée. */
export function entityName(row: Record<string, unknown> | null) {
  if (!row) return "";
  for (const k of ["number", "title", "name", "label", "full_name", "code", "subject"]) if (typeof row[k] === "string" && row[k]) return row[k] as string;
  if (row.first_name) return `${row.first_name} ${row.last_name ?? ""}`.trim();
  if (row.kind && row.at) return `${row.kind} · ${String(row.at).slice(0, 16).replace("T", " ")}`;
  return "";
}

export interface AuditFilters {
  table?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  row?: string;
  system?: boolean;
}

export function parseFilters(sp: Record<string, string | undefined>): AuditFilters {
  return {
    table: sp.table && AUDITED[sp.table] ? sp.table : undefined,
    action: sp.action && ACTIONS[sp.action] ? sp.action : undefined,
    actor: sp.actor || undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to : undefined,
    row: /^[0-9a-f-]{36}$/.test(sp.row ?? "") ? sp.row : undefined,
    system: sp.system === "1",
  };
}

/** Requête filtrée sur le journal (la RLS masque ce que le rôle ne peut pas lire). */
export function auditQuery(db: Db, f: AuditFilters, limit: number, offset = 0) {
  const tz = sectorConfig.company.timezone;
  let q = db.from("audit_entries").select("*", { count: "exact" }).order("at", { ascending: false }).range(offset, offset + limit - 1);
  if (f.table) q = q.eq("table_name", f.table);
  if (f.action) q = q.eq("action", f.action);
  if (f.actor) q = q.eq("actor", f.actor);
  else if (!f.system) q = q.not("actor", "is", null);
  if (f.row) q = q.eq("row_id", f.row);
  if (f.from) q = q.gte("at", zonedToIso(f.from, "00:00", tz));
  if (f.to) q = q.lt("at", zonedToIso(new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10), "00:00", tz));
  return q;
}

/** Valeur affichable d'un champ (objets JSON résumés). */
export function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  }
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 16).replace("T", " ") : s.length > 80 ? `${s.slice(0, 77)}…` : s;
}
