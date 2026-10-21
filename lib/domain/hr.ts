/**
 * Règles RH (France) — fonctions pures, testées.
 * Congés payés : 25 jours ouvrés par an (2,08 j par mois), période de référence du 1er juin au 31 mai.
 */
import { workedHours, type BadgeEvent } from "./presence";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Les 11 jours fériés de France métropolitaine. */
export function frenchHolidays(year: number): Set<string> {
  const easter = utc(easterSunday(year));
  const plus = (n: number) => iso(new Date(easter.getTime() + n * 86_400_000));
  return new Set([
    `${year}-01-01`, plus(1), `${year}-05-01`, `${year}-05-08`, plus(39), plus(50),
    `${year}-07-14`, `${year}-08-15`, `${year}-11-01`, `${year}-11-11`, `${year}-12-25`,
  ]);
}

/** Jours ouvrés (lundi–vendredi hors fériés) entre deux dates incluses. */
export function businessDays(start: string, end: string): number {
  let n = 0;
  const holidays = new Map<number, Set<string>>();
  for (let t = utc(start).getTime(); t <= utc(end).getTime(); t += 86_400_000) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const y = d.getUTCFullYear();
    if (!holidays.has(y)) holidays.set(y, frenchHolidays(y));
    if (holidays.get(y)!.has(iso(d))) continue;
    n++;
  }
  return n;
}

/** Début de la période de référence des congés (1er juin). */
export function leavePeriodStart(today: string): string {
  const y = Number(today.slice(0, 4));
  return today.slice(5) >= "06-01" ? `${y}-06-01` : `${y - 1}-06-01`;
}

export interface LeaveBalance {
  acquired: number;
  taken: number;
  pending: number;
  available: number;
}

/**
 * Solde de congés payés : acquis au prorata des mois travaillés depuis le 1er juin
 * (ou l'embauche), au prorata du temps de travail, + report ; moins pris et en attente.
 */
export function leaveBalance(i: {
  today: string;
  startDate: string | null;
  workRate: number;
  carryover: number;
  leaves: { kind: string; status: string; starts_on: string; days: number }[];
}): LeaveBalance {
  const period = leavePeriodStart(i.today);
  const from = i.startDate && i.startDate > period ? i.startDate : period;
  const months = Math.max(0, (Number(i.today.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(i.today.slice(5, 7)) - Number(from.slice(5, 7)));
  const acquired = Math.round((months * (25 / 12) * i.workRate + i.carryover) * 10) / 10;
  const inPeriod = i.leaves.filter((l) => l.kind === "paid" && l.starts_on >= period);
  const taken = inPeriod.filter((l) => l.status === "approved").reduce((s, l) => s + Number(l.days), 0);
  const pending = inPeriod.filter((l) => l.status === "pending").reduce((s, l) => s + Number(l.days), 0);
  return { acquired, taken, pending, available: Math.round((acquired - taken - pending) * 10) / 10 };
}

/**
 * Heures badgées par jour (AAAA-MM-JJ → heures), pauses déduites. Une session encore ouverte
 * compte jusqu'à maintenant le jour même ; un jour passé (oubli de pointage) s'arrête au dernier
 * pointage connu, en attendant la correction.
 */
export function hoursByDay(events: (BadgeEvent & { day: string })[], now = new Date(), today?: string): Map<string, number> {
  const byDay = new Map<string, BadgeEvent[]>();
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  return new Map(
    [...byDay.entries()].map(([d, evs]) => {
      const end = today && d !== today ? new Date(Math.max(...evs.map((e) => e.at.getTime()))) : now;
      return [d, workedHours(evs, end)];
    }),
  );
}

export type BadgeAnomaly = "missing_out" | "open_break" | "no_in";

/** Anomalies d'une journée passée : sortie oubliée, pause non clôturée, sortie sans entrée. */
export function badgeAnomaly(kinds: string[]): BadgeAnomaly | null {
  if (!kinds.length) return null;
  if (!kinds.includes("in")) return "no_in";
  const last = kinds.at(-1);
  if (last === "break_start") return "open_break";
  if (last !== "out") return "missing_out";
  return null;
}

/** Heures supplémentaires de la semaine au-delà de la durée contractuelle. */
export const overtime = (weekHours: number, contractHours: number) => Math.max(0, Math.round((weekHours - contractHours) * 100) / 100);

/** Lundi de la semaine d'une date. */
export function mondayOf(dateIso: string): string {
  const d = utc(dateIso);
  const wd = (d.getUTCDay() + 6) % 7;
  return iso(new Date(d.getTime() - wd * 86_400_000));
}

/** Convertit une date et une heure locales d'un fuseau (ex. Europe/Paris) en instant ISO UTC. */
export function zonedToIso(day: string, time: string, timeZone: string): string {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (asLocal - guess)).toISOString();
}
