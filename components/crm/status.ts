export const QUOTE_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "ok" | "danger" | "warn" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Envoyé", tone: "info" },
  accepted: { label: "Accepté", tone: "ok" },
  rejected: { label: "Refusé", tone: "danger" },
  expired: { label: "Expiré", tone: "warn" },
};
