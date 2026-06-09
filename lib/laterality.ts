import type { MeasurementRow, MetricRow } from '@/lib/database.types';
import { isBetter } from '@/lib/metrics';

/** Körperseite eines Messwerts bei Richtungswechsel-Tests. */
export type Side = 'left' | 'right';

/** Metriken mit Links/Rechts-Erfassung (Tests mit Drehung auf einer Seite):
 *  5-0-5, 5-10-5 (Pro Agility), 5-10 90°, 5-10 180°. Der lineare 5-10 ist bewusst
 *  NICHT dabei – ein gerader Sprint hat keine Seite. */
export const SIDE_METRIC_KEYS: ReadonlySet<string> = new Set([
  '5_0_5',
  'pro_agility',
  '5_10_90',
  '5_10_180',
]);

export const SIDE_LABELS: Record<Side, string> = { left: 'Links', right: 'Rechts' };

/** Hat diese Metrik eine Links/Rechts-Erfassung? */
export function supportsSide(metric: MetricRow | null | undefined): boolean {
  return !!metric && SIDE_METRIC_KEYS.has(metric.key);
}

/** Bestwert einer Seite aus den Roh-Werten (beachtet higher_is_better). */
function bestForSide(
  rows: MeasurementRow[],
  side: Side,
  higherIsBetter: boolean,
): MeasurementRow | null {
  let best: MeasurementRow | null = null;
  for (const r of rows) {
    if (r.side !== side) continue;
    if (!best || isBetter(r.value, best.value, higherIsBetter)) best = r;
  }
  return best;
}

export type SideComparison = {
  left: MeasurementRow | null;
  right: MeasurementRow | null;
  /** Relative Differenz in % – bezogen auf die bessere Seite. null, wenn eine
   *  Seite fehlt (kein Vergleich möglich). */
  pctDiff: number | null;
};

/** Bestwert je Seite + relative Differenz aus den Roh-Werten einer Metrik. */
export function computeSideComparison(
  rows: MeasurementRow[],
  higherIsBetter: boolean,
): SideComparison {
  const left = bestForSide(rows, 'left', higherIsBetter);
  const right = bestForSide(rows, 'right', higherIsBetter);
  let pctDiff: number | null = null;
  if (left && right) {
    // Bezug = bessere Seite (Zeit: kleiner, sonst größer) → „X % schwächere Seite“.
    const better = higherIsBetter
      ? Math.max(left.value, right.value)
      : Math.min(left.value, right.value);
    if (better > 0) pctDiff = (Math.abs(left.value - right.value) / better) * 100;
  }
  return { left, right, pctDiff };
}

export type AsymmetrySeverity = 'none' | 'warn' | 'high';

/** Ampel für die Differenz: > 10 % rot, > 5 % gelb, sonst neutral. */
export function asymmetrySeverity(pctDiff: number | null): AsymmetrySeverity {
  if (pctDiff == null) return 'none';
  if (pctDiff > 10) return 'high';
  if (pctDiff > 5) return 'warn';
  return 'none';
}
