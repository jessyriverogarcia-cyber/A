/**
 * Achats : réception partielle des commandes et performance des fournisseurs. Fonctions pures, testées.
 */

export interface ReceivableLine {
  stock_item_id: string;
  qty: number;
  received?: number;
}

export const remaining = (l: ReceivableLine) => Math.max(0, Math.round((l.qty - (l.received ?? 0)) * 1000) / 1000);

/**
 * Quantités réellement réceptionnées : jamais plus que le reste à recevoir (un surplus se traite
 * par un mouvement de stock), lignes à zéro ignorées. Indique le statut qui en résulte.
 */
export function planReceipt(lines: ReceivableLine[], input: Record<string, number>) {
  const take = lines
    .map((l) => ({ stock_item_id: l.stock_item_id, qty: Math.min(remaining(l), Math.max(0, Number(input[l.stock_item_id] ?? 0) || 0)) }))
    .filter((t) => t.qty > 0);
  const after = lines.map((l) => ({ ...l, received: (l.received ?? 0) + (take.find((t) => t.stock_item_id === l.stock_item_id)?.qty ?? 0) }));
  const complete = after.every((l) => remaining(l) === 0);
  const capped = lines.some((l) => Number(input[l.stock_item_id] ?? 0) > remaining(l));
  return { take, lines: after, status: complete ? ("received" as const) : take.length || lines.some((l) => (l.received ?? 0) > 0) ? ("partially_received" as const) : ("sent" as const), capped };
}

/** Taux de service d'un fournisseur sur les commandes reçues : à l'heure, retard moyen, encours. */
export function supplierPerformance(pos: { status: string; expected_on: string | null; received_at: string | null; total: number }[], today: string) {
  const received = pos.filter((p) => p.status === "received" && p.received_at && p.expected_on);
  const delays = received.map((p) => Math.round((new Date(p.received_at!.slice(0, 10)).getTime() - new Date(p.expected_on!).getTime()) / 86_400_000));
  const open = pos.filter((p) => p.status === "sent" || p.status === "partially_received");
  return {
    orders: pos.filter((p) => p.status !== "cancelled" && p.status !== "draft").length,
    onTimeRate: received.length ? delays.filter((d) => d <= 0).length / received.length : null,
    averageDelay: received.length ? Math.round((delays.reduce((s, d) => s + Math.max(0, d), 0) / received.length) * 10) / 10 : null,
    open: open.length,
    openValue: Math.round(open.reduce((s, p) => s + Number(p.total), 0) * 100) / 100,
    lateOpen: open.filter((p) => p.expected_on && p.expected_on < today).length,
  };
}
