import { can, requireUser } from "@/lib/auth";
import { ModuleTabs } from "@/components/ui/ModuleTabs";
import { EmptyState } from "@/components/ui/backoffice";

export default async function CommsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  if (!can(ctx, "comms")) {
    return (
      <div className="p-8">
        <EmptyState title="Communication non accessible" hint={`Votre rôle (${ctx.role.label}) n'a pas accès aux échanges.`} />
      </div>
    );
  }
  const tabs = [
    { href: "/comms", label: "Boîte de réception" },
    { href: "/comms/documents", label: "Documents" },
  ];
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <ModuleTabs tabs={tabs} />
      {children}
    </div>
  );
}
