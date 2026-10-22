"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const Task = z.object({ work_order_id: z.string().uuid(), title: z.string().min(3).max(140), assignee_employee_id: z.string().uuid().nullable(), due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() });

/** Exécute une proposition de l'assistant après le clic de l'utilisateur (droits vérifiés ici aussi). */
export async function confirmTaskAction(input: z.infer<typeof Task>): Promise<{ ok: boolean; message: string; href?: string }> {
  const ctx = await requireUser();
  if (!can(ctx, "ops", "create")) return { ok: false, message: "Votre rôle ne permet pas de créer des tâches." };
  const p = Task.safeParse(input);
  if (!p.success) return { ok: false, message: "Proposition invalide." };
  const db = await createClient();
  const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("work_order_id", p.data.work_order_id);
  const { error } = await db.from("tasks").insert({ org_id: ctx.org.id, work_order_id: p.data.work_order_id, title: p.data.title, assignee_employee_id: p.data.assignee_employee_id, due_on: p.data.due_on, status: "todo", position: count ?? 0 });
  if (error) return { ok: false, message: error.message };
  if (p.data.assignee_employee_id && p.data.assignee_employee_id !== ctx.employee_id)
    await db.rpc("notify_employee", { p_employee: p.data.assignee_employee_id, p_title: `${ctx.full_name} vous a confié une tâche`, p_body: p.data.title, p_link: `/ops/work-orders/${p.data.work_order_id}` });
  return { ok: true, message: "Tâche créée.", href: `/ops/work-orders/${p.data.work_order_id}` };
}

export async function deleteConversationAction(form: FormData) {
  await requireUser();
  const db = await createClient();
  await db.from("ai_conversations").delete().eq("id", String(form.get("id")));
  redirect("/ai");
}
