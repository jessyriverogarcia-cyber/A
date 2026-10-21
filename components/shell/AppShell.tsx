import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { sectorConfig } from "@/config/sector.config";
import { Badge, Logo } from "@/components/ui/primitives";
import { can, type UserContext } from "@/lib/auth";
import type { Module } from "@/lib/domain/permissions";
import { signOut } from "@/app/(auth)/login/actions";

type NavItem = { key: string; href: string; module?: Module; phase?: number };

/** Ordre du menu : la Map, puis les modules dans l'ordre de priorité de la fiche secteur. */
function navItems(): NavItem[] {
  const moduleRoutes: Record<string, NavItem> = {
    crm: { key: "crm", href: "/crm", module: "crm" },
    ops: { key: "ops", href: "/ops", module: "ops" },
    finance: { key: "finance", href: "/finance", module: "finance" },
    resources: { key: "resources", href: "/resources", module: "resources" },
    hr: { key: "hr", href: "/hr", module: "hr" },
    comms: { key: "comms", href: "/comms", module: "comms", phase: 3 },
    ai: { key: "ai", href: "/ai", module: "ai", phase: 4 },
    pilotage: { key: "pilotage", href: "/pilotage", module: "pilotage", phase: 3 },
  };
  return [
    { key: "map", href: `/map/${sectorConfig.sites[0].id}`, module: "map" },
    { key: "me", href: "/me" },
    { key: "dashboard", href: "/dashboard", phase: 3 },
    ...sectorConfig.modulesPriority.map((m) => moduleRoutes[m]).filter(Boolean),
    { key: "tech", href: "/settings/tech" },
    { key: "security", href: "/settings/security" },
  ];
}

export async function AppShell({ ctx, children }: { ctx: UserContext; children: React.ReactNode }) {
  const t = await getTranslations();
  const items = navItems().filter((i) => !i.module || can(ctx, i.module));
  const simulated = sectorConfig.integrations.mode === "simulated";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 self-start shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Logo size={32} />
          <span className="font-semibold">{sectorConfig.company.name}</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {items.map((i) => (
            <Link
              key={i.key}
              href={i.href}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
            >
              <span>{t(`nav.${i.key}`)}</span>
              {i.phase && <span className="text-[10px] text-muted">P{i.phase}</span>}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-border p-3 text-sm">
          {simulated && (
            <Badge tone="warn" title={t("common.simulatedHint")}>
              ● {t("common.simulated")}
            </Badge>
          )}
          <div>
            <p className="font-medium">{ctx.full_name}</p>
            <p className="text-xs text-muted">
              {ctx.role.label}
              {ctx.role.read_only && ` · ${t("common.readOnly")}`}
            </p>
          </div>
          <form action={signOut}>
            <button className="text-xs text-muted hover:text-text">{t("common.signOut")}</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function PhasePlaceholder({ title, phase, children }: { title: string; phase: number; children?: React.ReactNode }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Module prévu en phase {phase}.</p>
      {children}
    </div>
  );
}
