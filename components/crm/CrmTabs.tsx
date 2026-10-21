"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/crm", label: "À faire aujourd'hui" },
  { href: "/crm/pipeline", label: "Pipeline" },
  { href: "/crm/clients", label: "Clients" },
  { href: "/crm/quotes", label: "Devis" },
];

export function CrmTabs() {
  const path = usePathname();
  const active = TABS.filter((t) => path === t.href || (t.href !== "/crm" && path.startsWith(t.href))).at(-1)?.href ?? "/crm";
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => (
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
