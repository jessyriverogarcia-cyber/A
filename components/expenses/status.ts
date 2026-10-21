export const EXPENSE_STATUS: Record<string, { label: string; tone: "warn" | "ok" | "danger" | "neutral" | "info" }> = {
  pending: { label: "À valider", tone: "warn" },
  approved: { label: "Validée", tone: "info" },
  rejected: { label: "Refusée", tone: "danger" },
  reimbursed: { label: "Remboursée", tone: "ok" },
};
