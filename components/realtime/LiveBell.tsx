"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRealtime } from "./useRealtime";

/** Cloche des notifications : le compteur et un aperçu arrivent en direct. */
export function LiveBell({ userId, initial, label }: { userId: string; initial: number; label: string }) {
  const [count, setCount] = useState(initial);
  const [toast, setToast] = useState<{ title: string; body?: string; link?: string } | null>(null);
  useEffect(() => setCount(initial), [initial]);
  useRealtime("bell", [{ table: "notifications", event: "INSERT", filter: `user_id=eq.${userId}` }], (_t, row) => {
    setCount((c) => c + 1);
    setToast({ title: String(row.title ?? ""), body: row.body ? String(row.body) : undefined, link: row.link ? String(row.link) : undefined });
    setTimeout(() => setToast(null), 6000);
  });
  return (
    <>
      <Link href="/notifications" className="relative ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label={label} data-testid="bell">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white" data-testid="bell-count">
            {count}
          </span>
        )}
      </Link>
      {toast && (
        <Link href={toast.link ?? "/notifications"} role="status" data-testid="notif-toast" className="fixed right-4 bottom-4 z-50 w-80 rounded-card border border-border bg-surface p-4 text-sm shadow-xl" style={{ animation: "toastin 200ms ease-out" }}>
          <p className="font-medium">{toast.title}</p>
          {toast.body && <p className="mt-0.5 text-muted">{toast.body}</p>}
        </Link>
      )}
    </>
  );
}
