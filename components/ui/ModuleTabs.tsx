"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/** Onglets d'un module du back-office (l'onglet racine n'est actif que sur sa page exacte). */
export function ModuleTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  const root = tabs[0]?.href;
  const active = tabs.filter((t) => path === t.href || (t.href !== root && path.startsWith(t.href))).at(-1)?.href ?? root;
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={clsx(
            "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
            active === t.href ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
