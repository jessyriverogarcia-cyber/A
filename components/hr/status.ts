export const LEAVE_KIND: Record<string, string> = { paid: "Congés payés", rtt: "RTT", sick: "Maladie", unpaid: "Sans solde", training: "Formation", other: "Autre" };
export const LEAVE_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "ok" | "danger" | "warn" }> = {
  pending: { label: "En attente", tone: "warn" },
  approved: { label: "Validé", tone: "ok" },
  rejected: { label: "Refusé", tone: "danger" },
  cancelled: { label: "Annulé", tone: "neutral" },
};
export const CANDIDATE_STAGES: { id: string; label: string }[] = [
  { id: "new", label: "Nouveaux" },
  { id: "screening", label: "Présélection" },
  { id: "interview", label: "Entretien" },
  { id: "offer", label: "Offre" },
  { id: "hired", label: "Recruté·e" },
  { id: "rejected", label: "Non retenu·e" },
];
export const PRESENCE: Record<string, { label: string; tone: "neutral" | "info" | "ok" | "danger" | "warn" | "accent" }> = {
  at_station: { label: "Au poste", tone: "ok" },
  on_break: { label: "En pause", tone: "info" },
  in_meeting: { label: "En réunion", tone: "accent" },
  absent: { label: "Absent·e", tone: "neutral" },
  remote: { label: "Télétravail", tone: "info" },
  travel: { label: "Déplacement", tone: "info" },
  leave: { label: "En congé", tone: "warn" },
};
