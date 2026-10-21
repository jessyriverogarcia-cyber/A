"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Change = { table: string; event: "INSERT" | "UPDATE" | "DELETE" | "*"; filter?: string };

/**
 * Abonnement Supabase Realtime authentifié (la RLS s'applique aux changements reçus).
 * Le jeton de session est passé avant l'abonnement, sinon seules les tables publiques arrivent.
 */
export function useRealtime(name: string, changes: Change[], onChange: (table: string, row: Record<string, unknown>) => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = JSON.stringify(changes);
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel = supabase.channel(`${name}:${Math.random().toString(36).slice(2)}`);
      for (const c of JSON.parse(key) as Change[]) {
        channel.on("postgres_changes" as never, { event: c.event, schema: "public", table: c.table, ...(c.filter ? { filter: c.filter } : {}) } as never, (m: { new: Record<string, unknown> }) => cb.current(c.table, m.new ?? {}));
      }
      channel.subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [name, key]);
}
