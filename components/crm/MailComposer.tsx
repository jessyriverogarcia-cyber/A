"use client";

import { useRef } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SimulatedBadge } from "@/components/ui/backoffice";

/**
 * Un clic → e-mail pré-rempli à relire. L'envoi part par le fournisseur de messagerie
 * (simulé tant qu'aucun compte n'est connecté).
 */
export function MailComposer({
  label,
  title,
  to,
  subject,
  body,
  action,
  hidden,
  variant = "primary",
  testId,
  simulated = true,
}: {
  label: string;
  title: string;
  to: string | null;
  subject: string;
  body: string;
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  variant?: "primary" | "secondary";
  testId?: string;
  /** Faux quand une boîte Microsoft 365 / Google est connectée : l'envoi est réel. */
  simulated?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        data-testid={testId}
        className={
          variant === "primary"
            ? "inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            : "inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-border/60"
        }
      >
        {label}
      </button>
      <dialog ref={ref} className="m-auto w-[min(640px,92vw)] rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/40">
        <form action={action} className="space-y-3 p-5">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            {simulated ? <SimulatedBadge /> : <span className="text-xs font-medium text-ok">● envoi réel</span>}
          </div>
          <p className="text-sm text-muted">
            À : <span className="text-text">{to ?? "aucun e-mail de contact"}</span>
          </p>
          <input name="subject" defaultValue={subject} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <textarea name="body" defaultValue={body} rows={12} className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-2">
              Annuler
            </button>
            <SubmitButton testId={testId ? `${testId}-confirm` : undefined}>Envoyer</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
