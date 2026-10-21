"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { sectorConfig } from "@/config/sector.config";
import { createClient } from "@/lib/supabase/client";
import { moveDealAction } from "@/app/(backoffice)/crm/actions";

export interface KanbanDeal {
  id: string;
  title: string;
  stage: string;
  value: number;
  probability: number;
  client_id: string;
  client_name: string;
  next_step: string | null;
  next_step_on: string | null;
  owner: string | null;
}

const money = new Intl.NumberFormat(sectorConfig.company.locale, { style: "currency", currency: sectorConfig.company.currency, maximumFractionDigits: 0 });

export function Kanban({ deals, canMove, orgId, today }: { deals: KanbanDeal[]; canMove: boolean; orgId: string; today: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, move] = useOptimistic(deals, (state, { id, stage }: { id: string; stage: string }) => state.map((d) => (d.id === id ? { ...d, stage } : d)));

  // Pipeline en direct : une affaire déplacée ailleurs (ou un devis signé) se met à jour ici.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getSession().then(({ data }) => {
      supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel = supabase
        .channel(`pipeline:${orgId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `org_id=eq.${orgId}` }, () => router.refresh())
        .subscribe();
    });
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  const columns = useMemo(
    () => sectorConfig.crm.pipelineStages.map((s) => ({ ...s, deals: optimistic.filter((d) => d.stage === s.id) })),
    [optimistic],
  );

  const doMove = (id: string, stage: string) => {
    const deal = optimistic.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    setError(null);
    start(async () => {
      move({ id, stage });
      const r = await moveDealAction(id, stage);
      if (!r.ok) setError(r.reason ?? "Déplacement refusé");
      router.refresh();
    });
  };

  return (
    <>
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex items-start gap-3 overflow-x-auto pb-4" data-testid="kanban">
        {columns.map((col) => {
          const total = col.deals.reduce((s, d) => s + d.value, 0);
          return (
            <section
              key={col.id}
              data-testid={`col-${col.id}`}
              onDragOver={(e) => {
                if (!canMove) return;
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) doMove(id, col.id);
              }}
              className={clsx("flex min-h-64 w-72 shrink-0 flex-col rounded-card border bg-surface-2/50", over === col.id ? "border-accent" : "border-border")}
            >
              <header className="border-b border-border px-3 py-2.5" style={{ borderTop: `3px solid ${col.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                <div className="flex items-center justify-between text-sm font-semibold">
                  {col.label}
                  <span className="rounded-full bg-surface px-2 text-xs text-muted">{col.deals.length}</span>
                </div>
                <p className="text-xs text-muted tabular-nums">
                  {money.format(total)}
                  {col.outcome === "open" && ` · pondéré ${money.format(total * col.probability)}`}
                </p>
              </header>
              <div className="flex-1 space-y-2 p-2">
                {col.deals.map((d) => {
                  const late = d.next_step_on && d.next_step_on < today && col.outcome === "open";
                  return (
                    <article
                      key={d.id}
                      draggable={canMove}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", d.id);
                        setDragging(d.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      data-testid={`deal-${d.id}`}
                      className={clsx("rounded-lg border border-border bg-surface p-3 text-sm shadow-sm", canMove && "cursor-grab", dragging === d.id && "opacity-50")}
                    >
                      <Link href={`/crm/clients/${d.client_id}`} className="text-xs text-muted hover:text-accent">{d.client_name}</Link>
                      <p className="leading-snug font-medium">{d.title}</p>
                      <p className="mt-1 font-semibold tabular-nums">{money.format(d.value)}</p>
                      {d.next_step && (
                        <p className={clsx("mt-1 text-xs", late ? "text-danger" : "text-muted")}>
                          → {d.next_step}
                          {late && " (en retard)"}
                        </p>
                      )}
                      {canMove && (
                        <select
                          aria-label="Changer d'étape"
                          value={d.stage}
                          onChange={(e) => doMove(d.id, e.target.value)}
                          data-testid={`deal-stage-${d.id}`}
                          className="mt-2 w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                        >
                          {sectorConfig.crm.pipelineStages.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
