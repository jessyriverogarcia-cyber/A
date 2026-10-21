import { sectorConfig } from "@/config/sector.config";
import { can, requireUser } from "@/lib/auth";
import { ModuleTabs } from "@/components/ui/ModuleTabs";
import { EmptyState } from "@/components/ui/backoffice";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  if (!can(ctx, "ops")) {
    return (
      <div className="p-8">
        <EmptyState title="Module Production non accessible" hint={`Votre rôle (${ctx.role.label}) n'a pas accès à la Production.`} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <ModuleTabs
        tabs={[
          { href: "/ops", label: "À faire aujourd'hui" },
          { href: "/ops/work-orders", label: sectorConfig.workOrder.labelPlural },
          { href: "/ops/planning", label: "Planning machines" },
        ]}
      />
      {children}
    </div>
  );
}
