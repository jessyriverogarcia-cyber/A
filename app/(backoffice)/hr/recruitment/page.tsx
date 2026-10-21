import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { Flash, PageHeader, Select } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CANDIDATE_STAGES } from "@/components/hr/status";
import { addCandidateAction, candidateStageAction } from "../actions";

export const metadata = { title: "Recrutement" };

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const [{ data: jobs }, { data: candidates }] = await Promise.all([
    db.from("job_openings").select("id, title, department, status, description").order("title"),
    db.from("candidates").select("id, full_name, email, source, score, ai_summary, stage, job_opening_id").order("score"),
  ]);
  const write = can(ctx, "hr", "update");
  return (
    <>
      <PageHeader title="Recrutement" subtitle={`${(jobs ?? []).filter((j) => j.status === "open").length} postes ouverts · ${(candidates ?? []).length} candidats`} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        {(jobs ?? []).map((j) => (
          <Card key={j.id} className="p-4">
            <p className="font-medium">{j.title} <Badge tone={j.status === "open" ? "ok" : "neutral"}>{j.status === "open" ? "ouvert" : j.status}</Badge></p>
            <p className="text-xs text-muted">{j.department} · {j.description}</p>
          </Card>
        ))}
      </div>
      <div className="flex items-start gap-3 overflow-x-auto pb-4" data-testid="candidates-board">
        {CANDIDATE_STAGES.map((s) => {
          const col = (candidates ?? []).filter((c) => c.stage === s.id);
          return (
            <section key={s.id} className="flex min-h-40 w-64 shrink-0 flex-col rounded-card border border-border bg-surface-2/50" data-testid={`cand-col-${s.id}`}>
              <header className="flex justify-between border-b border-border px-3 py-2.5 text-sm font-semibold">{s.label}<span className="rounded-full bg-surface px-2 text-xs text-muted">{col.length}</span></header>
              <div className="space-y-2 p-2">
                {col.map((c) => (
                  <article key={c.id} className="rounded-lg border border-border bg-surface p-3 text-sm shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{c.full_name}</p>
                      <Badge tone={c.score === "A" ? "ok" : c.score === "B" ? "info" : "neutral"} title="Score de présélection">{c.score ?? "–"}</Badge>
                    </div>
                    <p className="text-xs text-muted">{(jobs ?? []).find((j) => j.id === c.job_opening_id)?.title} · {c.source}</p>
                    {c.ai_summary && <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-xs" title="Résumé généré (simulé tant que l'IA n'est pas branchée)">✦ {c.ai_summary}</p>}
                    {write && (
                      <form action={candidateStageAction} className="mt-2 flex gap-1">
                        <input type="hidden" name="candidate_id" value={c.id} />
                        <Select name="stage" defaultValue={c.stage} className="py-1 text-xs" aria-label="Étape" data-testid={`cand-stage-${c.full_name}`}>
                          {CANDIDATE_STAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </Select>
                        <SubmitButton variant="secondary" className="px-2 py-1 text-xs" testId={`cand-move-${c.full_name}`}>OK</SubmitButton>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {can(ctx, "hr", "create") && (
        <Card className="max-w-2xl">
          <CardTitle>Ajouter un candidat</CardTitle>
          <form action={addCandidateAction} className="grid gap-2 sm:grid-cols-2">
            <Input name="full_name" placeholder="Nom complet" required />
            <Input name="email" type="email" placeholder="E-mail" />
            <Select name="job_opening_id" defaultValue="">
              <option value="">Candidature spontanée</option>
              {(jobs ?? []).map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </Select>
            <Input name="source" placeholder="Source (site, cooptation…)" />
            <div><SubmitButton variant="secondary">Ajouter</SubmitButton></div>
          </form>
        </Card>
      )}
    </>
  );
}
