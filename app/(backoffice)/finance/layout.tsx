import { can, requireUser } from "@/lib/auth";
import { ModuleTabs } from "@/components/ui/ModuleTabs";
import { EmptyState } from "@/components/ui/backoffice";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  if (!can(ctx, "finance")) {
    return (
      <div className="p-8">
        <EmptyState title="Module Finance non accessible" hint={`Votre rôle (${ctx.role.label}) n'a pas accès à la Finance.`} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <ModuleTabs
        tabs={[
          { href: "/finance", label: "À faire aujourd'hui" },
          { href: "/finance/invoices", label: "Factures" },
          { href: "/finance/cash", label: "Trésorerie" },
        ]}
      />
      {children}
    </div>
  );
}
