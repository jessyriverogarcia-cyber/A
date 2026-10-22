"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const q = (m: string) => encodeURIComponent(m);
function back(k: "ok" | "err", m: string): never {
  redirect(`/settings/users?${k}=${q(m)}`);
}

async function guard() {
  const ctx = await requireUser();
  if (!can(ctx, "settings", "update")) back("err", "Réservé à la direction.");
  return { ctx, db: await createClient() };
}

const Invite = z.object({
  email: z.string().trim().toLowerCase().email("E-mail invalide"),
  full_name: z.string().trim().min(2, "Nom obligatoire"),
  role_id: z.string().uuid("Rôle obligatoire"),
  employee_id: z.string().uuid().nullable(),
});

/**
 * Invitation : compte créé côté Supabase Auth (clé service, serveur uniquement), e-mail d'invitation,
 * profil rattaché à l'organisation de l'invitant. La personne se connecte ensuite par lien,
 * mot de passe ou SSO Microsoft / Google avec la même adresse.
 */
export async function inviteUserAction(form: FormData) {
  const { ctx, db } = await guard();
  const p = Invite.safeParse({ email: form.get("email"), full_name: form.get("full_name"), role_id: form.get("role_id"), employee_id: (form.get("employee_id") as string) || null });
  if (!p.success) back("err", p.error.issues[0].message);
  // Le rôle et le salarié doivent appartenir à l'organisation de l'invitant (RLS côté lecture).
  const { data: role } = await db.from("roles").select("id, label").eq("id", p.data.role_id).maybeSingle();
  if (!role) back("err", "Rôle inconnu.");
  if (p.data.employee_id) {
    const { data: emp } = await db.from("employees").select("id").eq("id", p.data.employee_id).maybeSingle();
    if (!emp) back("err", "Salarié inconnu.");
    const { count } = await db.from("profiles").select("user_id", { count: "exact", head: true }).eq("employee_id", p.data.employee_id);
    if (count) back("err", "Ce salarié a déjà un compte.");
  }
  const admin = createAdminClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(p.data.email, { redirectTo: `${site}/auth/callback`, data: { full_name: p.data.full_name } });
  if (error) back("err", error.message.includes("already") ? "Un compte existe déjà avec cette adresse." : error.message);
  const { error: e2 } = await admin.from("profiles").insert({ user_id: invited!.user.id, org_id: ctx.org.id, role_id: role!.id, full_name: p.data.full_name, locale: ctx.locale, employee_id: p.data.employee_id });
  if (e2) {
    await admin.auth.admin.deleteUser(invited!.user.id);
    back("err", e2.message);
  }
  await db.from("activity_events").insert({ org_id: ctx.org.id, type: "user.invited", entity_type: "profile", entity_id: invited!.user.id, actor: ctx.user_id, payload: { email: p.data.email, role: role!.label } });
  back("ok", `Invitation envoyée à ${p.data.email} (${role!.label}).`);
}

async function directionCount(db: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await db.from("profiles").select("user_id, roles!inner(key)").eq("roles.key", "direction");
  return (data ?? []).length;
}

export async function changeRoleAction(form: FormData) {
  const { ctx, db } = await guard();
  const userId = String(form.get("user_id"));
  const roleId = String(form.get("role_id"));
  const { data: target } = await db.from("profiles").select("user_id, full_name, roles(key)").eq("user_id", userId).maybeSingle();
  const { data: role } = await db.from("roles").select("id, key, label").eq("id", roleId).maybeSingle();
  if (!target || !role) back("err", "Utilisateur ou rôle introuvable.");
  const wasDirection = (target!.roles as unknown as { key: string } | null)?.key === "direction";
  if (wasDirection && role!.key !== "direction" && (await directionCount(db)) <= 1) back("err", "Il doit rester au moins un compte direction.");
  if (userId === ctx.user_id && role!.key !== "direction") back("err", "Vous ne pouvez pas retirer vos propres droits de direction.");
  const { error } = await db.from("profiles").update({ role_id: role!.id }).eq("user_id", userId);
  if (error) back("err", error.message);
  back("ok", `${target!.full_name} : rôle « ${role!.label} ».`);
}

/** Retrait d'accès : le profil est supprimé (le compte Auth est bloqué) ; l'historique et l'audit restent. */
export async function revokeAccessAction(form: FormData) {
  const { ctx, db } = await guard();
  const userId = String(form.get("user_id"));
  if (userId === ctx.user_id) back("err", "Vous ne pouvez pas retirer votre propre accès.");
  const { data: target } = await db.from("profiles").select("full_name, roles(key)").eq("user_id", userId).maybeSingle();
  if (!target) back("err", "Utilisateur introuvable.");
  if ((target!.roles as unknown as { key: string } | null)?.key === "direction" && (await directionCount(db)) <= 1) back("err", "Il doit rester au moins un compte direction.");
  const admin = createAdminClient();
  // Vérifie l'organisation côté serveur avant d'agir avec la clé service.
  const { data: same } = await admin.from("profiles").select("user_id").eq("user_id", userId).eq("org_id", ctx.org.id).maybeSingle();
  if (!same) back("err", "Utilisateur hors de votre organisation.");
  await admin.from("profiles").delete().eq("user_id", userId);
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  back("ok", `Accès retiré à ${target!.full_name}.`);
}
