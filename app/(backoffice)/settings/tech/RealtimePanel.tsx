"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { sectorConfig } from "@/config/sector.config";
import { Badge, Button, Card, CardTitle } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";

type Event = { id: string; type: string; payload: Record<string, unknown>; at: string };

const label = (type: string) => sectorConfig.liveEvents.find((e) => e.activityType === type)?.label ?? type;
const time = (at: string) => new Date(at).toLocaleTimeString(sectorConfig.company.locale, { timeZone: sectorConfig.company.timezone });

export function RealtimePanel({ orgId, initial }: { orgId: string; initial: Event[] }) {
  const t = useTranslations("tech");
  const [events, setEvents] = useState(initial);
  const [status, setStatus] = useState<"connecting" | "connected">("connecting");

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // Le jeton doit être transmis à Realtime avant l'abonnement, sinon la RLS filtre tout.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel = supabase
        .channel(`activity:${orgId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events", filter: `org_id=eq.${orgId}` }, (msg) =>
          setEvents((prev) => [msg.new as Event, ...prev].slice(0, 20)),
        )
        .subscribe((s) => s === "SUBSCRIBED" && setStatus("connected"));
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [orgId]);

  async function emit() {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    await supabase.from("activity_events").insert({
      org_id: orgId,
      type: "badge.in",
      entity_type: "test",
      payload: { source: "page technique" },
      actor: data.user?.id,
    });
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <CardTitle className="mb-0">{t("realtime")}</CardTitle>
          <p className="text-xs text-muted">{t("realtimeHint")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={status === "connected" ? "ok" : "warn"} data-testid="realtime-status">● {t(status)}</Badge>
          <Button onClick={emit} data-testid="realtime-emit">{t("emit")}</Button>
        </div>
      </div>
      <ul className="divide-y divide-border text-sm" data-testid="realtime-list">
        {events.length === 0 && <li className="py-2 text-muted">{t("waiting")}</li>}
        {events.map((e) => (
          <li key={e.id} className="flex justify-between py-1.5">
            <span>{label(e.type)} <span className="text-xs text-muted">{JSON.stringify(e.payload)}</span></span>
            <span className="text-xs text-muted">{time(e.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
