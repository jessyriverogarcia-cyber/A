import clsx from "clsx";
import { stockLevel } from "@/lib/domain/stock";

/** Jauge de stock : la zone sous le minimum est marquée. */
export function StockGauge({ quantity, min, className }: { quantity: number; min: number; className?: string }) {
  const max = Math.max(min * 2.5, quantity, 1);
  const lvl = stockLevel(quantity, min);
  return (
    <div className={clsx("relative h-2 w-full overflow-hidden rounded-full bg-surface-2", className)} role="meter" aria-valuenow={quantity} aria-valuemin={0} aria-valuemax={max}>
      <div className={clsx("h-full rounded-full", lvl === "ok" ? "bg-ok" : lvl === "low" ? "bg-warn" : "bg-danger")} style={{ width: `${(quantity / max) * 100}%` }} />
      <div className="absolute inset-y-0 w-px bg-text/40" style={{ left: `${(min / max) * 100}%` }} title="Minimum" />
    </div>
  );
}
