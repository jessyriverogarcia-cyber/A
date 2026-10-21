export const PO_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "ok" | "danger" | "warn" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Envoyée", tone: "info" },
  partially_received: { label: "Reçue en partie", tone: "warn" },
  received: { label: "Reçue", tone: "ok" },
  cancelled: { label: "Annulée", tone: "danger" },
};

export const STOCK_CATEGORIES: Record<string, string> = { filament: "Filaments", resin: "Résines", powder_polymer: "Poudres polymère", powder_metal: "Poudres métal", gas: "Gaz", finished_part: "Pièces finies" };
