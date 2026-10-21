import { requireUser, can } from "@/lib/auth";
import { CrmTabs } from "@/components/crm/CrmTabs";
import { EmptyState } from "@/components/ui/backoffice";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  if (!can(ctx, "crm")) {
    return (
      <div className="p-8">
        <EmptyState title="Module Commercial non accessible" hint={`Votre rôle (${ctx.role.label}) n'a pas accès au Commercial.`} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <CrmTabs />
      {children}
    </div>
  );
}
