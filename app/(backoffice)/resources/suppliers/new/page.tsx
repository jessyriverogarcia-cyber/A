import { can, requireUser } from "@/lib/auth";
import { Card } from "@/components/ui/primitives";
import { EmptyState, Flash, PageHeader } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SupplierFields } from "@/components/resources/SupplierFields";
import { STOCK_CATEGORIES } from "@/components/resources/status";
import { createSupplierAction } from "../../actions";

export const metadata = { title: "Nouveau fournisseur" };

export default async function NewSupplierPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  if (!can(ctx, "resources", "create")) return <EmptyState title="Lecture seule" />;
  return (
    <>
      <PageHeader back={{ href: "/resources/suppliers", label: "Fournisseurs" }} title="Nouveau fournisseur" />
      <Flash ok={sp.ok} err={sp.err} />
      <Card className="max-w-3xl">
        <form action={createSupplierAction} className="space-y-4">
          <SupplierFields categories={STOCK_CATEGORIES} />
          <SubmitButton testId="supplier-save">Créer</SubmitButton>
        </form>
      </Card>
    </>
  );
}
