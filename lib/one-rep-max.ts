/**
 * 1RM-Rechner für Kraftübungen: aus Last × Wiederholungen das geschätzte
 * Maximalgewicht (One-Rep Max) ableiten. Formel: Brzycki.
 *
 * Erkennung anhand Kategorie 'strength' + Einheit 'kg' (z. B. Kniebeuge,
 * Bankdrücken, Trap Bar, gewichtete Klimmzüge). Reine Wiederholungs-Tests wie
 * „Klimmzüge" (Einheit 'reps') bleiben außen vor.
 *
 * Gespeichert wird das berechnete 1RM als `value` (damit Graph, Kacheln und
 * Bestleistungen normal weiterlaufen); `reps`/`weight` halten fest, wie es
 * zustande kam. Bei 1 Wiederholung ist das 1RM exakt die Last.
 */

import type { MetricRow } from '@/lib/database.types';
import { formatNumber } from '@/lib/format';

/** Höchste sinnvolle Wiederholungszahl für die Schätzung (darüber wird Brzycki unbrauchbar). */
export const REPS_MAX = 15;

/** Greift der 1RM-Rechner für diese Metrik? (Kraftübung mit kg-Last.) */
export function supportsOneRepMax(metric: MetricRow): boolean {
  return metric.category === 'strength' && metric.unit === 'kg';
}

/**
 * Geschätztes 1RM nach Brzycki: w × 36 / (37 − r).
 * Bei r = 1 exakt w. Gibt NaN bei ungültigen Eingaben zurück.
 */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return NaN;
  if (weight <= 0 || reps < 1 || reps >= 37) return NaN;
  if (reps === 1) return weight;
  return (weight * 36) / (37 - reps);
}

/** Schätzwert auf 1 Nachkommastelle runden. */
export function roundOneRepMax(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * „3 × 50 kg" – wie kam das 1RM zustande? null bei 1 Wiederholung oder fehlenden
 * Daten (dann nichts anzeigen; der Wert ist bereits das 1RM).
 */
export function oneRepMaxBreakdown(
  reps: number | null | undefined,
  weight: number | null | undefined,
  unit: string,
): string | null {
  if (reps == null || weight == null || reps <= 1) return null;
  return `${reps} × ${formatNumber(weight, unit)} ${unit}`.trim();
}
