import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { categoryOf } from "@/lib/domain/expenses";

const csv = (rows: (string | number | null)[][]) =>
  "﻿" + rows.map((r) => r.map((v) => (v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : `"${String(v).replace(/"/g, '""')}"`)).join(";")).join("\r\n");

/** Notes validées (à rembourser) : export pour la paie ou le virement, Excel FR. */
export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return new Response("Non autorisé", { status: 401 });
  if (!can(ctx, "expenses", "export")) return new Response("Export réservé à la comptabilité", { status: 403 });
  const db = await createClient();
  const { data } = await db.from("expenses").select("label, category, amount, vat_amount, km, spent_on, employees:employees!expenses_employee_id_fkey(last_name, first_name)").eq("status", "approved").order("spent_on");
  const body = csv([
    ["Salarié", "Date", "Catégorie", "Libellé", "Km", "Montant TTC", "TVA", "TVA récupérable"],
    ...(data ?? []).map((e) => {
      const x = e.employees as unknown as { last_name: string; first_name: string };
      const cat = categoryOf(sectorConfig.expenses, e.category);
      return [`${x.last_name} ${x.first_name}`, e.spent_on, cat?.label ?? e.category, e.label, e.km === null ? null : Number(e.km), Number(e.amount), Number(e.vat_amount), cat?.vatRecoverable ? Number(e.vat_amount) : 0];
    }),
  ]);
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="notes-de-frais-a-rembourser.csv"' } });
}
