import { sectorConfig } from "@/config/sector.config";
import { Card, CardTitle, Input } from "@/components/ui/primitives";
import { Field, Flash, PageHeader, Select } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createClientAction } from "../../actions";

export const metadata = { title: "Nouveau client" };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Nouveau client" back={{ href: "/crm/clients", label: "Clients" }} />
      <Flash err={sp.err} />
      <form action={createClientAction} className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Société</CardTitle>
          <div className="space-y-3">
            <Field label="Raison sociale *"><Input name="name" required data-testid="client-name" /></Field>
            <Field label="Secteur"><Input name="industry" placeholder="Aéronautique, médical…" /></Field>
            <Field label="Famille de produits">
              <Select name="product_family" defaultValue="">
                <option value="">—</option>
                {sectorConfig.productFamilies.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ville"><Input name="city" /></Field>
              <Field label="N° TVA intracom."><Input name="vat_number" placeholder="FR…" /></Field>
            </div>
            <Field label="Statut">
              <Select name="status" defaultValue="prospect">
                <option value="prospect">Prospect</option>
                <option value="active">Actif</option>
              </Select>
            </Field>
          </div>
        </Card>
        <Card>
          <CardTitle>Contact principal</CardTitle>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom"><Input name="contact_first_name" data-testid="contact-first" /></Field>
              <Field label="Nom"><Input name="contact_last_name" data-testid="contact-last" /></Field>
            </div>
            <Field label="Fonction"><Input name="contact_job_title" /></Field>
            <Field label="E-mail"><Input name="contact_email" type="email" data-testid="contact-email" /></Field>
            <Field label="Téléphone"><Input name="contact_phone" /></Field>
          </div>
        </Card>
        <div className="lg:col-span-2">
          <SubmitButton testId="client-submit">Créer le client</SubmitButton>
        </div>
      </form>
    </>
  );
}
