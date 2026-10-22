import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { EmptyState, Field, Flash, PageHeader, Select, Table, Td } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { changeRoleAction, inviteUserAction, revokeAccessAction } from "./actions";

export const metadata = { title: "Utilisateurs" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  if (!can(ctx, "settings")) return <div className="p-8"><EmptyState title="Réservé à la direction" /></div>;
  const db = await createClient();
  const admin = can(ctx, "settings", "update");
  const [{ data: profiles }, { data: roles }, { data: employees }] = await Promise.all([
    db.from("profiles").select("user_id, full_name, employee_id, role_id, created_at, roles(label, key)").order("full_name"),
    db.from("roles").select("id, key, label").order("label"),
    db.from("employees").select("id, first_name, last_name, email").eq("active", true).order("first_name"),
  ]);
  // Adresse, dernière connexion et méthode : uniquement via l'API d'administration (serveur).
  const ids = new Set((profiles ?? []).map((p) => p.user_id));
  const { data: users } = admin ? await createAdminClient().auth.admin.listUsers({ perPage: 500 }) : { data: { users: [] } };
  const auth = new Map((users?.users ?? []).filter((u) => ids.has(u.id)).map((u) => [u.id, u]));
  const linked = new Set((profiles ?? []).map((p) => p.employee_id).filter(Boolean));
  const sso = (process.env.NEXT_PUBLIC_SSO_PROVIDERS ?? "").split(",").filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <PageHeader title="Utilisateurs" subtitle={`Comptes et rôles. Connexion par mot de passe, lien magique${sso.length ? " ou SSO" : ""} ; double authentification dans « Sécurité du compte ».`} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Table head={["Nom", "Adresse", "Rôle", "Dernière connexion", ""]} empty={!profiles?.length && <EmptyState title="Aucun compte" />}>
          {(profiles ?? []).map((p) => {
            const u = auth.get(p.user_id);
            const role = p.roles as unknown as { label: string; key: string } | null;
            const me = p.user_id === ctx.user_id;
            return (
              <tr key={p.user_id} data-testid="user-row">
                <Td>
                  <span className="font-medium">{p.full_name}</span> {me && <Badge>vous</Badge>}
                  {u?.app_metadata?.providers && <span className="block text-xs text-muted">{(u.app_metadata.providers as string[]).map((x) => (x === "azure" ? "Microsoft" : x === "google" ? "Google" : x === "email" ? "e-mail" : x)).join(", ")}</span>}
                </Td>
                <Td className="text-muted">{u?.email ?? "—"}{u && !u.last_sign_in_at && <Badge tone="info" className="ml-2">invité</Badge>}</Td>
                <Td>
                  {admin && !me ? (
                    <form action={changeRoleAction} className="flex items-center gap-1">
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <Select name="role_id" defaultValue={p.role_id} className="py-1 text-xs" aria-label={`Rôle de ${p.full_name}`}>
                        {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </Select>
                      <SubmitButton variant="secondary" className="px-2 py-1 text-xs">OK</SubmitButton>
                    </form>
                  ) : (
                    role?.label
                  )}
                </Td>
                <Td className="whitespace-nowrap text-muted">{u?.last_sign_in_at ? formatDate(u.last_sign_in_at) : "—"}</Td>
                <Td className="text-right">
                  {admin && !me && (
                    <form action={revokeAccessAction}>
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <SubmitButton variant="danger" className="px-2 py-1 text-xs" confirm={`Retirer l'accès de ${p.full_name} ?`} testId={`revoke-${p.full_name}`}>Retirer l&apos;accès</SubmitButton>
                    </form>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
        {admin && (
          <Card>
            <CardTitle>Inviter une personne</CardTitle>
            <form action={inviteUserAction} className="space-y-3">
              <Field label="E-mail professionnel"><Input name="email" type="email" required data-testid="invite-email" /></Field>
              <Field label="Nom"><Input name="full_name" required data-testid="invite-name" /></Field>
              <Field label="Rôle">
                <Select name="role_id" required defaultValue="" data-testid="invite-role">
                  <option value="" disabled>Choisir…</option>
                  {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
              </Field>
              <Field label="Salarié (pour la badgeuse, les congés…)">
                <Select name="employee_id" defaultValue="">
                  <option value="">Aucun</option>
                  {(employees ?? []).filter((e) => !linked.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </Select>
              </Field>
              <SubmitButton testId="invite-submit">Envoyer l&apos;invitation</SubmitButton>
              <p className="text-xs text-muted">La personne reçoit un lien pour se connecter{sso.length ? ", ou se connecte directement avec son compte Microsoft / Google de même adresse" : ""}.</p>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
