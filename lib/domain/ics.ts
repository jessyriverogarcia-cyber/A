/**
 * Flux iCalendar (RFC 5545) : abonnement depuis Outlook, Google Agenda ou Calendrier Apple.
 * Fonctions pures, testées.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  start: string; // ISO (instant) ou AAAA-MM-JJ si journée entière
  end: string; // ISO, ou AAAA-MM-JJ du dernier jour inclus si journée entière
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  updatedAt?: string;
}

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const date = (d: string) => d.slice(0, 10).replace(/-/g, "");
const nextDay = (d: string) => new Date(new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/** Repli des lignes à 75 octets (UTF-8), continuation par un espace. */
export function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(calendarName: string, events: IcsEvent[], now = new Date()): string {
  const stamp = utc(now.toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Strato Fab//Map vivante//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escape(calendarName)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${e.updatedAt ? utc(e.updatedAt) : stamp}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${date(e.start)}`, `DTEND;VALUE=DATE:${date(nextDay(e.end))}`);
    else lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`);
    lines.push(`SUMMARY:${escape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
