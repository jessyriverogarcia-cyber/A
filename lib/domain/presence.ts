export type BadgeKind = "in" | "out" | "break_start" | "break_end";

export interface BadgeEvent {
  kind: BadgeKind;
  at: Date;
}

export type PresenceState = "absent" | "present" | "on_break";

/** État courant d'après la dernière badgeuse. */
export function presenceFromBadges(events: BadgeEvent[]): PresenceState {
  const last = [...events].sort((a, b) => a.at.getTime() - b.at.getTime()).at(-1);
  if (!last || last.kind === "out") return "absent";
  if (last.kind === "break_start") return "on_break";
  return "present";
}

/**
 * Heures travaillées sur une journée : somme des intervalles de présence,
 * pauses déduites. Un pointage encore ouvert est compté jusqu'à `now`.
 */
export function workedHours(events: BadgeEvent[], now: Date = new Date()): number {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  let ms = 0;
  let openSince: Date | null = null;
  for (const e of sorted) {
    if (e.kind === "in" || e.kind === "break_end") {
      openSince ??= e.at;
    } else if (openSince) {
      ms += e.at.getTime() - openSince.getTime();
      openSince = null;
    }
  }
  if (openSince) ms += Math.max(0, now.getTime() - openSince.getTime());
  return Math.round((ms / 3_600_000) * 100) / 100;
}
