import Link from "next/link";
import clsx from "clsx";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, AI_MODEL } from "@/lib/ai/assistant";
import { toolsFor } from "@/lib/ai/tools";
import { formatDate } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui/backoffice";
import { Badge } from "@/components/ui/primitives";
import { Chat } from "@/components/ai/Chat";
import { deleteConversationAction } from "./actions";

export const metadata = { title: "Assistant IA" };

const SUGGESTIONS: [string, string][] = [
  ["finance", "Quelles factures sont en retard ?"],
  ["ops", "Quels dossiers sont en retard ?"],
  ["resources", "Quel stock est bas ?"],
  ["comms", "Quels messages attendent une réponse ?"],
  ["pilotage", "Fais-moi la synthèse du jour"],
  ["presence", "Qui est présent aujourd'hui ?"],
];

export default async function AiPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  if (!can(ctx, "ai")) return <div className="p-8"><EmptyState title="Assistant non accessible" /></div>;
  const db = await createClient();
  const { data: convs } = await db.from("ai_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(30);
  const current = sp.c && (convs ?? []).some((c) => c.id === sp.c) ? sp.c : null;
  const { data: msgs } = current ? await db.from("ai_messages").select("role, text, simulated, tools").eq("conversation_id", current).not("text", "is", null).order("id") : { data: [] };
  const simulated = !aiConfigured();
  const allowed = new Set(toolsFor(ctx).map((t) => t.module));
  const suggestions = SUGGESTIONS.filter(([m]) => allowed.has(m as never)).map(([, s]) => s);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <PageHeader
        title="Assistant IA"
        subtitle={`Interroge les données avec vos droits (${ctx.role.label}) : ${toolsFor(ctx).length} outil(s) disponibles.`}
        actions={simulated ? <Badge tone="warn" title="Ajoutez ANTHROPIC_API_KEY côté serveur pour activer Claude.">● Mode simulé — aucune clé API</Badge> : <Badge tone="ok">Claude · {AI_MODEL}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-1">
          <Link href="/ai" className={clsx("block rounded-lg px-3 py-2 text-sm", !current ? "bg-accent/10 font-medium text-accent" : "hover:bg-surface-2")}>+ Nouvelle conversation</Link>
          {(convs ?? []).map((c) => (
            <div key={c.id} className={clsx("group flex items-center rounded-lg", c.id === current ? "bg-surface-2" : "hover:bg-surface-2/60")}>
              <Link href={`/ai?c=${c.id}`} className="min-w-0 flex-1 px-3 py-2">
                <span className="block truncate text-sm">{c.title}</span>
                <span className="text-xs text-muted">{formatDate(c.updated_at)}</span>
              </Link>
              <form action={deleteConversationAction} className="pr-2 opacity-0 group-hover:opacity-100">
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-muted hover:text-danger" aria-label="Supprimer la conversation">✕</button>
              </form>
            </div>
          ))}
          <p className="px-3 pt-3 text-xs text-muted">Conversations privées : visibles par vous seul·e.</p>
        </aside>
        <Chat
          key={sp.n ? "new" : (current ?? "new")}
          conversationId={current}
          simulated={simulated}
          suggestions={suggestions}
          initial={(msgs ?? []).map((m) => ({ role: m.role as "user" | "assistant", text: m.text ?? "", simulated: m.role === "assistant" && m.simulated }))}
        />
      </div>
    </div>
  );
}
