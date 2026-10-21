import Link from "next/link";
import clsx from "clsx";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sectorConfig } from "@/config/sector.config";
import { Input, Card } from "@/components/ui/primitives";
import { EmptyState, Field, Flash, PageHeader, Select, SimulatedBadge, Textarea } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { newThreadAction } from "../actions";
import { mailMode } from "@/lib/integrations/mail";

export const metadata = { title: "Nouveau message" };

const KINDS = [
  { id: "client", label: "Client" },
  { id: "supplier", label: "Fournisseur" },
  { id: "internal", label: "Collègue (interne)" },
];

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  if (!can(ctx, "comms", "create")) return <EmptyState title="Lecture seule" hint="Votre rôle ne permet pas d'écrire." />;
  const db = await createClient();
  const kind = KINDS.some((k) => k.id === sp.kind) ? sp.kind : "client";
  const [{ data: clients }, { data: suppliers }, { data: employees }, { data: wos }] = await Promise.all([
    db.from("clients").select("id, name").order("name"),
    db.from("suppliers").select("id, name").order("name"),
    db.from("employees").select("id, first_name, last_name, job_title").eq("active", true).order("first_name"),
    db.from("work_orders").select("id, number, title, client_id").eq("status", "active").order("number"),
  ]);
  const wo = (wos ?? []).find((w) => w.id === sp.wo);

  return (
    <>
      <PageHeader back={{ href: "/comms", label: "Boîte de réception" }} title="Nouveau message" actions={kind !== "internal" && (await mailMode(db)).simulated ? <SimulatedBadge /> : undefined} />
      <Flash ok={sp.ok} err={sp.err} />
      <nav className="mb-4 flex gap-2">
        {KINDS.map((k) => (
          <Link key={k.id} href={`/comms/new?kind=${k.id}${sp.wo ? `&wo=${sp.wo}` : ""}`} className={clsx("rounded-full border px-3 py-1 text-sm", kind === k.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-text")}>
            {k.label}
          </Link>
        ))}
      </nav>
      <Card className="max-w-2xl">
        <form action={newThreadAction} className="space-y-4">
          <input type="hidden" name="kind" value={kind} />
          {kind === "client" && (
            <Field label="Client">
              <Select name="client_id" defaultValue={wo?.client_id ?? ""} required>
                <option value="" disabled>Choisir…</option>
                {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          {kind === "supplier" && (
            <Field label="Fournisseur">
              <Select name="supplier_id" defaultValue="" required>
                <option value="" disabled>Choisir…</option>
                {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          {kind === "internal" && (
            <Field label="Destinataire" hint="Votre collègue reçoit une notification.">
              <Select name="employee_id" defaultValue="" required data-testid="internal-to">
                <option value="" disabled>Choisir…</option>
                {(employees ?? []).filter((e) => e.id !== ctx.employee_id).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.job_title}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Dossier (facultatif)">
            <Select name="work_order_id" defaultValue={wo?.id ?? ""}>
              <option value="">Aucun</option>
              {(wos ?? []).map((w) => <option key={w.id} value={w.id}>{w.number} — {w.title}</option>)}
            </Select>
          </Field>
          <Field label="Sujet">
            <Input name="subject" required defaultValue={wo ? `${wo.number} — ${wo.title}` : ""} />
          </Field>
          <Field label="Message">
            <Textarea name="body" required rows={8} defaultValue={kind === "internal" ? "" : "Bonjour,\n\n\n\nBien cordialement,\n" + ctx.full_name + "\n" + sectorConfig.company.name} />
          </Field>
          <div className="flex justify-end">
            <SubmitButton testId="new-thread-send">Envoyer</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
