export const PO_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "ok" | "danger" | "warn" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Envoyée", tone: "info" },
  received: { label: "Reçue", tone: "ok" },
  cancelled: { label: "Annulée", tone: "danger" },
};
