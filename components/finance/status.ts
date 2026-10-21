export const INVOICE_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "ok" | "danger" | "warn" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Émise", tone: "info" },
  partially_paid: { label: "Payée en partie", tone: "warn" },
  paid: { label: "Payée", tone: "ok" },
  overdue: { label: "En retard", tone: "danger" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export const INVOICE_KIND: Record<string, string> = { invoice: "Facture", deposit: "Acompte", credit_note: "Avoir" };
