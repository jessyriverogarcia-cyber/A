import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { auditDiff } from "@/lib/domain/pilotage";
import { ACTIONS, AUDITED, auditQuery, entityName, parseFilters, show } from "@/lib/services/audit";

const csv = (rows: (string | null)[][]) => "﻿" + rows.map((r) => r.map((v) => (v === null ? "" : `"${v.replace(/"/g, '""')}"`)).join(";")).join("\r\n");

/** Export du journal filtré (5 000 lignes max), séparateur « ; » pour Excel FR. */
export async function GET(req: Request) {
  const ctx = await getUserContext();
  if (!ctx) return new Response("Non autorisé", { status: 401 });
  if (!can(ctx, "pilotage", "export")) return new Response("Export réservé à la direction", { status: 403 });
  const f = parseFilters(Object.fromEntries(new URL(req.url).searchParams));
  const db = await createClient();
  const { data } = await auditQuery(db, f, 5000);
  const body = csv([
    ["Date (UTC)", "Auteur", "Action", "Objet", "Fiche", "Identifiant", "Changements"],
    ...(data ?? []).map((r) => [
      r.at!,
      r.actor_name ?? "Système",
      ACTIONS[r.action!] ?? r.action,
      AUDITED[r.table_name!]?.label ?? r.table_name,
      entityName((r.new_data ?? r.old_data) as Record<string, unknown> | null),
      r.row_id,
      auditDiff(r.old_data as Record<string, unknown> | null, r.new_data as Record<string, unknown> | null).map((c) => `${c.field}: ${show(c.before)} → ${show(c.after)}`).join(" | "),
    ]),
  ]);
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="journal-audit.csv"` } });
}
