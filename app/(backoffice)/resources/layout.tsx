import { can, requireUser } from "@/lib/auth";
import { ModuleTabs } from "@/components/ui/ModuleTabs";
import { EmptyState } from "@/components/ui/backoffice";

export default async function ResourcesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  if (!can(ctx, "resources")) {
    return (
      <div className="p-8">
        <EmptyState title="Module Ressources non accessible" hint={`Votre rôle (${ctx.role.label}) n'a pas accès aux Ressources.`} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <ModuleTabs
        tabs={[
          { href: "/resources", label: "À faire aujourd'hui" },
          { href: "/resources/stock", label: "Stock" },
          { href: "/resources/purchase-orders", label: "Commandes fournisseurs" },
          { href: "/resources/equipment", label: "Équipements" },
        ]}
      />
      {children}
    </div>
  );
}
