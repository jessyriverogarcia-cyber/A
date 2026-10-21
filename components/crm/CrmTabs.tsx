import { ModuleTabs } from "@/components/ui/ModuleTabs";

export function CrmTabs() {
  return (
    <ModuleTabs
      tabs={[
        { href: "/crm", label: "À faire aujourd'hui" },
        { href: "/crm/pipeline", label: "Pipeline" },
        { href: "/crm/clients", label: "Clients" },
        { href: "/crm/quotes", label: "Devis" },
      ]}
    />
  );
}
