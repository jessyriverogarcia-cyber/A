import { can, requireUser } from "@/lib/auth";
import { ModuleTabs } from "@/components/ui/ModuleTabs";
import { EmptyState } from "@/components/ui/backoffice";

export default async function PilotageLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  if (!can(ctx, "pilotage")) {
    return (
      <div className="p-8">
        <EmptyState title="Pilotage non accessible" hint={`Votre rôle (${ctx.role.label}) n'a pas accès au pilotage. Votre journée est dans « Tableau de bord ».`} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <ModuleTabs tabs={[{ href: "/pilotage", label: "Tableau de bord direction" }, { href: "/pilotage/audit", label: "Journal d'audit" }]} />
      {children}
    </div>
  );
}
