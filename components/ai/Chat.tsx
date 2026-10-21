"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { confirmTaskAction } from "@/app/(backoffice)/ai/actions";

type Proposal = { kind: "create_task"; label: string; params: { work_order_id: string; title: string; assignee_employee_id: string | null; due_on: string | null } };
type Turn = {
  role: "user" | "assistant";
  text: string;
  tools?: { name: string; label: string; status: string }[];
  links?: { href: string; label: string }[];
  proposals?: (Proposal & { state?: "pending" | "done" | "error"; result?: string; href?: string })[];
  simulated?: boolean;
  error?: string;
};

/** Rendu léger : paragraphes, listes à puces, gras. Aucun HTML injecté. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-•*]\s/.test(l) || !l.trim()))
          return <ul key={i} className="my-1 list-disc space-y-0.5 pl-5">{lines.filter((l) => l.trim()).map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-•*]\s/, ""))}</li>)}</ul>;
        return <p key={i} className="my-1 whitespace-pre-wrap">{lines.map((l, k) => <span key={k}>{inline(l)}{k < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </>
  );
}

export function Chat({ conversationId, initial, simulated, suggestions }: { conversationId: string | null; initial: Turn[]; simulated: boolean; suggestions: string[] }) {
  const [turns, setTurns] = useState<Turn[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conv = useRef(conversationId);
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [turns]);

  const patchLast = (f: (t: Turn) => Turn) => setTurns((ts) => [...ts.slice(0, -1), f(ts[ts.length - 1])]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setInput("");
    setTurns((ts) => [...ts, { role: "user", text: message }, { role: "assistant", text: "", tools: [], links: [], proposals: [] }]);
    try {
      const res = await fetch("/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conv.current, message }) });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "conversation" && !conv.current) {
            conv.current = e.id;
            window.history.replaceState(null, "", `/ai?c=${e.id}&n=1`); // n=1 : même composant, pas de remontage
          } else if (e.type === "text") patchLast((t) => ({ ...t, text: t.text + e.delta }));
          else if (e.type === "tool")
            patchLast((t) => {
              const others = (t.tools ?? []).filter((x) => !(x.name === e.name && x.status === "start"));
              return { ...t, tools: [...others, { name: e.name, label: e.label, status: e.status }] };
            });
          else if (e.type === "link") patchLast((t) => ({ ...t, links: [...(t.links ?? []).filter((l) => l.href !== e.href), { href: e.href, label: e.label }] }));
          else if (e.type === "proposal") patchLast((t) => ({ ...t, proposals: [...(t.proposals ?? []), { ...e.proposal, state: "pending" }] }));
          else if (e.type === "done") patchLast((t) => ({ ...t, simulated: e.simulated }));
          else if (e.type === "error") patchLast((t) => ({ ...t, error: e.message }));
        }
      }
    } catch (err) {
      patchLast((t) => ({ ...t, error: err instanceof Error ? err.message : "Erreur réseau" }));
    } finally {
      setBusy(false);
      router.refresh(); // liste des conversations
    }
  }

  async function confirm(ti: number, pi: number) {
    const p = turns[ti].proposals![pi];
    const r = await confirmTaskAction(p.params);
    setTurns((ts) => ts.map((t, i) => (i !== ti ? t : { ...t, proposals: t.proposals!.map((x, k) => (k !== pi ? x : { ...x, state: r.ok ? "done" : "error", result: r.message, href: r.href })) })));
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[480px] flex-col rounded-card border border-border bg-surface">
      <div className="flex-1 space-y-4 overflow-y-auto p-5" data-testid="chat-log">
        {!turns.length && (
          <div className="mx-auto max-w-xl py-10 text-center">
            <p className="text-lg font-medium">Que voulez-vous savoir ?</p>
            <p className="mt-1 text-sm text-muted">L&apos;assistant interroge les modules avec vos droits. Il peut préparer un brouillon ou proposer une tâche, jamais envoyer ni supprimer.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent" data-testid="suggestion">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={clsx("flex", t.role === "user" ? "justify-end" : "justify-start")}>
            <div className={clsx("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed", t.role === "user" ? "bg-accent text-white" : "border border-border bg-surface-2/50")} data-testid={t.role === "assistant" ? "assistant-turn" : "user-turn"}>
              {!!t.tools?.length && (
                <ul className="mb-1.5 flex flex-wrap gap-1.5">
                  {t.tools.map((x) => (
                    <li key={x.name + x.status} className={clsx("rounded-full px-2 py-0.5 text-xs", x.status === "start" ? "bg-info/10 text-info" : x.status === "error" ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok")}>
                      {x.status === "start" ? "⋯" : x.status === "error" ? "✕" : "✓"} {x.label}
                    </li>
                  ))}
                </ul>
              )}
              {t.text ? <Rich text={t.text} /> : t.role === "assistant" && busy && i === turns.length - 1 && <span className="text-muted">Réflexion…</span>}
              {!!t.proposals?.length && (
                <div className="mt-2 space-y-2">
                  {t.proposals.map((p, k) => (
                    <div key={k} className="rounded-lg border border-accent/30 bg-accent/5 p-3">
                      <p className="text-sm">{p.label}</p>
                      {p.state === "pending" ? (
                        <button onClick={() => confirm(i, k)} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white" data-testid="confirm-proposal">Créer</button>
                      ) : (
                        <p className={clsx("mt-1 text-xs", p.state === "done" ? "text-ok" : "text-danger")}>{p.result} {p.href && <Link href={p.href} className="underline">Voir</Link>}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!!t.links?.length && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.links.map((l) => (
                    <Link key={l.href} href={l.href} className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs hover:border-accent hover:text-accent">{l.label} →</Link>
                  ))}
                </div>
              )}
              {t.simulated && <p className="mt-1.5 text-[11px] text-warn">● mode simulé — aucune IA</p>}
              {t.error && <p className="mt-1.5 text-xs text-danger">{t.error}</p>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={simulated ? "Question type : factures en retard, dossiers en retard, stock bas…" : "Posez votre question (ex. : prépare une réponse au client pour OF-2026-0007)"}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          data-testid="chat-input"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50" data-testid="chat-send">
          {busy ? "…" : "Envoyer"}
        </button>
      </form>
    </div>
  );
}
