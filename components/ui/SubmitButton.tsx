"use client";

import { useFormStatus } from "react-dom";
import clsx from "clsx";

/** Bouton de formulaire Server Action avec état « en cours ». */
export function SubmitButton({
  children,
  variant = "primary",
  className,
  name,
  value,
  formAction,
  testId,
  confirm,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  name?: string;
  value?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
  testId?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      disabled={pending}
      data-testid={testId}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60",
        variant === "primary" && "bg-accent text-white hover:brightness-110",
        variant === "secondary" && "border border-border bg-surface-2 hover:bg-border/60",
        variant === "danger" && "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
        className,
      )}
    >
      {pending ? "…" : children}
    </button>
  );
}
