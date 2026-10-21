import Link from "next/link";
import clsx from "clsx";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { todayIso } from "@/lib/domain/kpis";
import { mondayOf, zonedToIso } from "@/lib/domain/hr";
import { mailMode } from "@/lib/integrations/mail";
import { formatTime } from "@/lib/format";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { Field, Flash, PageHeader, Select } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LEAVE_KIND } from "@/components/hr/status";
import { createEventAction, deleteEventAction, regenerateFeedAction } from "./actions";

export const metadata = { title: "Agenda" };

const KIND: Record<string, { label: string; cls: string }> = {
  meeting: { label: "Réunion", cls: "border-info/40 bg-info/10" },
  client: { label: "Client", cls: "border-accent/40 bg-accent/10" },
  focus: { label: "Concentration", cls: "border-border bg-surface-2" },
  travel: { label: "Déplacement", cls: "border-warn/40 bg-warn/10" },
  remote: { label: "Télétravail", cls: "border-border bg-surface-2" },
  maintenance: { label: "Maintenance", cls: "border-danger/40 bg-danger/10" },
  break: { label: "Pause", cls: "border-border bg-surface-2" },
  other: { label: "Autre", cls: "border-border bg-surface-2" },
};
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const dayFmt = new Intl.DateTimeFormat(sectorConfig.company.locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const localDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: sectorConfig.company.timezone }).format(new Date(iso));

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const tz = sectorConfig.company.timezone;
  const today = todayIso(tz);
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.w ?? "") ? sp.w : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const team = sp.scope === "team";
  const [{ data: events }, { data: leaves }, { data: employees }, { data: clients }, { data: feed }, mailbox] = await Promise.all([
    db.from("calendar_events").select("id, title, kind, starts_at, ends_at, owner_employee_id, participants, location, asset_id").gte("starts_at", zonedToIso(monday, "00:00", tz)).lt("starts_at", zonedToIso(addDays(monday, 7), "00:00", tz)).order("starts_at"),
    db.from("leave_requests").select("id, employee_id, kind, starts_on, ends_on").eq("status", "approved").lte("starts_on", days[6]).gte("ends_on", monday),
    db.from("employees").select("id, first_name, last_name").eq("active", true).order("first_name"),
    db.from("clients").select("id, name").order("name"),
    db.from("calendar_feeds").select("created_at, last_read_at").eq("user_id", ctx.user_id).maybeSingle(),
    mailMode(db),
  ]);
  const me = ctx.employee_id;
  const name = (id: string | null) => {
    const e = (employees ?? []).find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name.charAt(0)}.` : "";
  };
  const mine = (e: { owner_employee_id: string | null; participants: string[]; asset_id: string | null }) => e.owner_employee_id === me || (me ? e.participants.includes(me) : false);
  const shown = (events ?? []).filter((e) => team || mine(e) || (e.kind === "maintenance" && !e.owner_employee_id));
  const absences = (leaves ?? []).filter((l) => team || l.employee_id === me);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const feedUrl = sp.feed ? `${site}/ical/${sp.feed}.ics` : null;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <PageHeader
        title="Agenda"
        subtitle={`Semaine du ${dayFmt.format(new Date(`${monday}T12:00:00Z`))} · réunions, rendez-vous clients, absences et maintenances`}
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/planning?w=${addDays(monday, -7)}${team ? "&scope=team" : ""}`} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">←</Link>
            <Link href={`/planning${team ? "?scope=team" : ""}`} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">Aujourd&apos;hui</Link>
            <Link href={`/planning?w=${addDays(monday, 7)}${team ? "&scope=team" : ""}`} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">→</Link>
            <span className="ml-2 inline-flex overflow-hidden rounded-lg border border-border">
              <Link href={`/planning?w=${monday}`} className={clsx("px-3 py-1.5", !team ? "bg-accent/10 text-accent" : "hover:bg-surface-2")}>Moi</Link>
              <Link href={`/planning?w=${monday}&scope=team`} className={clsx("px-3 py-1.5", team ? "bg-accent/10 text-accent" : "hover:bg-surface-2")} data-testid="scope-team">Équipe</Link>
            </span>
          </div>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7" data-testid="week">
          {days.map((d) => {
            const items = shown.filter((e) => localDay(e.starts_at) === d);
            const off = absences.filter((l) => l.starts_on <= d && l.ends_on >= d);
            const weekend = new Date(`${d}T12:00:00Z`).getUTCDay() % 6 === 0;
            return (
              <div key={d} className={clsx("min-h-40 rounded-card border p-2", d === today ? "border-accent/50 bg-accent/5" : "border-border bg-surface", weekend && "opacity-70")} data-testid={`day-${d}`}>
                <p className={clsx("mb-2 text-xs font-medium", d === today ? "text-accent" : "text-muted")}>{dayFmt.format(new Date(`${d}T12:00:00Z`))}</p>
                <ul className="space-y-1.5">
                  {off.map((l) => (
                    <li key={l.id} className="rounded-md border border-ok/40 bg-ok/10 px-2 py-1 text-xs">{l.employee_id === me ? "Vous" : name(l.employee_id)} · {LEAVE_KIND[l.kind] ?? "Absence"}</li>
                  ))}
                  {items.map((e) => (
                    <li key={e.id} className={clsx("group rounded-md border px-2 py-1 text-xs", KIND[e.kind]?.cls)} data-testid="event">
                      <p className="font-medium">{formatTime(e.starts_at)}–{formatTime(e.ends_at)}</p>
                      <p className="leading-snug">{e.title}</p>
                      <p className="text-muted">{[team && e.owner_employee_id ? name(e.owner_employee_id) : null, e.location].filter(Boolean).join(" · ")}</p>
                      {e.owner_employee_id === me && (
                        <form action={deleteEventAction} className="hidden group-hover:block">
                          <input type="hidden" name="event_id" value={e.id} />
                          <input type="hidden" name="w" value={monday} />
                          <button className="text-[11px] text-muted hover:text-danger">Supprimer</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <aside className="space-y-4">
          {me && (
            <Card>
              <CardTitle>Nouvel événement</CardTitle>
              <form action={createEventAction} className="space-y-2">
                <Input name="title" placeholder="Titre" required data-testid="event-title" />
                <Select name="kind" defaultValue="meeting">
                  {Object.entries(KIND).filter(([k]) => !["maintenance", "break"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
                <Input type="date" name="day" defaultValue={days.includes(today) ? today : monday} required data-testid="event-day" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" name="from" defaultValue="10:00" required data-testid="event-from" />
                  <Input type="time" name="to" defaultValue="11:00" required data-testid="event-to" />
                </div>
                <Field label="Invités">
                  <select name="participants" multiple className="h-24 w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm" data-testid="event-participants">
                    {(employees ?? []).filter((e) => e.id !== me).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                  </select>
                </Field>
                <Input name="location" placeholder="Lieu (salle, visio, adresse)" />
                <Select name="client_id" defaultValue="">
                  <option value="">Client (facultatif)</option>
                  {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <input type="hidden" name="back" value={`/planning?w=${monday}`} />
                <SubmitButton testId="event-save">Ajouter</SubmitButton>
              </form>
            </Card>
          )}
          <Card data-testid="ical">
            <CardTitle>Abonner mon agenda</CardTitle>
            <p className="text-sm text-muted">Vos événements et absences validées dans Outlook, Google Agenda ou Calendrier Apple (abonnement par URL, mis à jour automatiquement).</p>
            {feedUrl ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-warn">Copiez ce lien maintenant : il ne sera plus affiché.</p>
                <code className="block rounded-md bg-surface-2 p-2 text-[11px] break-all" data-testid="ical-url">{feedUrl}</code>
              </div>
            ) : feed ? (
              <p className="mt-2 text-xs text-muted">Lien actif{feed.last_read_at ? ` · lu par votre agenda le ${new Date(feed.last_read_at).toLocaleDateString(sectorConfig.company.locale)}` : " · pas encore lu"}.</p>
            ) : null}
            <form action={regenerateFeedAction} className="mt-2">
              <SubmitButton variant="secondary" testId="ical-generate" confirm={feed ? "Un nouveau lien remplace l'ancien, qui cessera de fonctionner. Continuer ?" : undefined}>{feed ? "Nouveau lien" : "Créer mon lien"}</SubmitButton>
            </form>
          </Card>
          <Card>
            <CardTitle>Agenda d&apos;équipe connecté</CardTitle>
            {mailbox.simulated ? (
              <p className="text-sm text-muted"><Badge tone="warn">non connecté</Badge> Les absences validées et les maintenances seront publiées dans l&apos;agenda de la boîte de l&apos;entreprise une fois connectée (Paramètres › Intégrations).</p>
            ) : (
              <p className="text-sm text-muted"><Badge tone="ok">● {mailbox.label}</Badge> Absences validées et maintenances publiées dans l&apos;agenda de {mailbox.account}.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
