"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "./useRealtime";

/**
 * Rafraîchit la page serveur quand une table partagée change (Map, scénario, collègue…).
 * Regroupe les changements rapprochés pour ne recharger qu'une fois.
 */
export function LiveRefresh({ tables, orgId, delay = 600 }: { tables: string[]; orgId: string; delay?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(
    `refresh:${tables.join(",")}`,
    tables.map((table) => ({ table, event: "*" as const, filter: `org_id=eq.${orgId}` })),
    () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), delay);
    },
  );
  return <span hidden data-testid="live-refresh" />;
}
