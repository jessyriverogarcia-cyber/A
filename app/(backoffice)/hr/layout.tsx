import { can, requireUser } from "@/lib/auth";
import { ModuleTabs } from "@/components/ui/ModuleTabs";
import { EmptyState } from "@/components/ui/backoffice";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  if (!can(ctx, "hr")) {
    return (
      <div className="p-8">
        <EmptyState title="Module RH non accessible" hint={`Votre rôle (${ctx.role.label}) n'a pas accès aux RH. Vos congés et vos heures sont dans « Mon espace ».`} />
      </div>
    );
  }
  const tabs = [
    { href: "/hr", label: "À faire aujourd'hui" },
    { href: "/hr/employees", label: "Équipe" },
    { href: "/hr/presence", label: "Présences" },
    { href: "/hr/leaves", label: "Congés" },
    { href: "/hr/recruitment", label: "Recrutement" },
    ...(can(ctx, "salaries") ? [{ href: "/hr/payroll", label: "Variables de paie" }] : []),
  ];
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <ModuleTabs tabs={tabs} />
      {children}
    </div>
  );
}
