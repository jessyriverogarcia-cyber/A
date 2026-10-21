import { Input } from "@/components/ui/primitives";
import { Field, Select, Textarea } from "@/components/ui/backoffice";

type S = { name?: string; category?: string | null; contact_name?: string | null; email?: string | null; phone?: string | null; address?: string | null; vat_number?: string | null; siret?: string | null; lead_time_days?: number | null; payment_terms_days?: number; notes?: string | null };

/** Champs de la fiche fournisseur (création et modification). */
export function SupplierFields({ s = {}, categories, disabled }: { s?: S; categories: Record<string, string>; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <Field label="Raison sociale"><Input name="name" required defaultValue={s.name} data-testid="supplier-name" /></Field>
      <Field label="Catégorie">
        <Select name="category" defaultValue={s.category ?? ""}>
          <option value="">—</option>
          {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Contact"><Input name="contact_name" defaultValue={s.contact_name ?? ""} /></Field>
      <Field label="E-mail de commande"><Input name="email" type="email" defaultValue={s.email ?? ""} data-testid="supplier-email" /></Field>
      <Field label="Téléphone"><Input name="phone" defaultValue={s.phone ?? ""} /></Field>
      <Field label="Adresse"><Input name="address" defaultValue={s.address ?? ""} /></Field>
      <Field label="N° TVA intracommunautaire"><Input name="vat_number" defaultValue={s.vat_number ?? ""} /></Field>
      <Field label="SIRET" hint="14 chiffres"><Input name="siret" defaultValue={s.siret ?? ""} inputMode="numeric" /></Field>
      <Field label="Délai de livraison habituel (jours)" hint="Sert au calcul du réassort"><Input name="lead_time_days" type="number" min={0} defaultValue={s.lead_time_days ?? ""} data-testid="supplier-lead" /></Field>
      <Field label="Délai de paiement (jours)"><Input name="payment_terms_days" type="number" min={0} max={120} defaultValue={s.payment_terms_days ?? 30} /></Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={s.notes ?? ""} className="min-h-16" placeholder="Certifications, conditions, interlocuteurs…" /></Field>
    </fieldset>
  );
}
