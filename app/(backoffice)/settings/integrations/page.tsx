import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { configured, PROVIDERS, redirectUri, type ProviderId } from "@/lib/integrations/oauth";
import { aiConfigured, AI_MODEL } from "@/lib/ai/assistant";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Flash, LinkButton, PageHeader } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { disconnectAction } from "./actions";

export const metadata = { title: "Intégrations" };

const ENV: Record<ProviderId, string> = { microsoft: "MS_CLIENT_ID, MS_CLIENT_SECRET (MS_TENANT_ID facultatif)", google: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET" };

/** État réel de chaque intégration : rien n'est présenté comme actif s'il ne l'est pas. */
export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const { data: accounts } = await db.from("integration_accounts").select("provider, account_email, connected_at, last_used_at, last_error");
  const { data: lastRun } = await db.from("job_runs").select("started_at, error").order("started_at", { ascending: false }).limit(1).maybeSingle();
  const admin = can(ctx, "settings", "update");
  const secretOk = (process.env.INTEGRATIONS_SECRET ?? "").length >= 32;

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <PageHeader title="Intégrations" subtitle="Ce qui est réellement branché, et comment brancher le reste. Tant qu'une intégration n'est pas connectée, elle est simulée et affichée comme telle." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 md:grid-cols-2" data-testid="integrations">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => {
          const acc = (accounts ?? []).find((a) => a.provider === p);
          const ready = configured(p);
          return (
            <Card key={p} data-testid={`integration-${p}`}>
              <div className="mb-2 flex items-center justify-between">
                <CardTitle className="mb-0">{PROVIDERS[p].label}</CardTitle>
                {acc && ready ? <Badge tone="ok">● connecté</Badge> : ready ? <Badge tone="info">prêt à connecter</Badge> : <Badge tone="warn">non configuré</Badge>}
              </div>
              <p className="text-sm text-muted">Envoi des devis, factures, relances, commandes et réponses depuis la boîte de l&apos;entreprise.</p>
              {acc && (
                <p className="mt-2 text-sm">
                  {acc.account_email} · connecté le {formatDate(acc.connected_at)}
                  {acc.last_used_at && <> · dernier envoi {formatDate(acc.last_used_at)}</>}
                  {acc.last_error && <span className="block text-danger">Dernière erreur : {acc.last_error}</span>}
                </p>
              )}
              {!ready && (
                <p className="mt-2 text-xs text-muted">
                  À configurer côté serveur : {ENV[p]} et INTEGRATIONS_SECRET (32 caractères minimum). URL de retour à déclarer : <code className="break-all">{redirectUri(p)}</code>
                </p>
              )}
              {admin && ready && (
                <div className="mt-3 flex gap-2">
                  <LinkButton href={`/settings/integrations/${p}/connect`} variant={acc ? "secondary" : "primary"}>{acc ? "Reconnecter" : "Connecter"}</LinkButton>
                  {acc && (
                    <form action={disconnectAction}>
                      <input type="hidden" name="provider" value={p} />
                      <SubmitButton variant="danger" confirm="Déconnecter cette boîte ? Les envois repasseront en simulation.">Déconnecter</SubmitButton>
                    </form>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        <Card data-testid="integration-ai">
          <div className="mb-2 flex items-center justify-between">
            <CardTitle className="mb-0">Assistant IA (Claude)</CardTitle>
            {aiConfigured() ? <Badge tone="ok">● actif · {AI_MODEL}</Badge> : <Badge tone="warn">mode simulé</Badge>}
          </div>
          <p className="text-sm text-muted">Questions sur les données, brouillons, propositions de tâches. Les outils respectent les droits de chaque rôle.</p>
          {!aiConfigured() && <p className="mt-2 text-xs text-muted">À configurer côté serveur : ANTHROPIC_API_KEY (modèle : AI_MODEL, par défaut {AI_MODEL}).</p>}
        </Card>
        <Card data-testid="integration-cron">
          <div className="mb-2 flex items-center justify-between">
            <CardTitle className="mb-0">Traitements planifiés (pg_cron)</CardTitle>
            {lastRun ? <Badge tone={lastRun.error ? "danger" : "ok"}>{lastRun.error ? "erreur" : "● actif"}</Badge> : <Badge tone="info">programmé</Badge>}
          </div>
          <p className="text-sm text-muted">Chaque jour à 4 h UTC : échéances, relances, maintenances, habilitations.{lastRun && ` Dernière exécution : ${formatDate(lastRun.started_at)}.`}</p>
        </Card>
      </div>
      {!secretOk && <p className="mt-4 text-xs text-muted">Clé de chiffrement des jetons (INTEGRATIONS_SECRET) absente : aucune boîte ne peut être connectée tant qu&apos;elle n&apos;est pas définie.</p>}
    </div>
  );
}
