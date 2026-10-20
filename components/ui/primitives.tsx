import clsx from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { sectorConfig } from "@/config/sector.config";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-card border border-border bg-surface p-5 shadow-[var(--shadow)]", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={clsx("mb-3 text-sm font-semibold tracking-wide text-muted uppercase", className)} {...props} />;
}

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:brightness-110",
        variant === "secondary" && "border border-border bg-surface-2 hover:bg-border/60",
        variant === "ghost" && "hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "accent";

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "ok" && "bg-ok/15 text-ok",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "danger" && "bg-danger/15 text-danger",
        tone === "info" && "bg-info/15 text-info",
        tone === "accent" && "bg-accent/15 text-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[28%] bg-accent font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, letterSpacing: "-0.03em" }}
    >
      {sectorConfig.company.logo.value}
    </span>
  );
}
