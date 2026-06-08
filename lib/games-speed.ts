/**
 * Games-Speed-/Richtungswechsel-Defizit: Wie viel langsamer sind die Cut-Varianten
 * (z. B. 5-10 90° / 180°) gegenüber dem linearen Referenztest (5-10 Linear)?
 *
 * Referenz wird per metric.key erkannt (`5_10_linear`). Verglichen wird jeweils
 * der LETZTE Tagesbestwert je Metrik – die Daten selbst bleiben unangetastet.
 */

import type { MeasurementRow, MetricRow } from '@/lib/database.types';

/** Schlüssel der Games-Speed-Gruppe (5-10-Familie) innerhalb der cod-Kategorie.
 *  Bewusst eine feste Liste statt eines Präfixes: so wird z. B. der Pro-Agility-
 *  Test (5-10-5) NICHT fälschlich als Cut-Variante gewertet. */
const GAMES_SPEED_KEYS = new Set(['5_10_linear', '5_10_90', '5_10_180']);

/** Schlüssel des linearen Referenztests innerhalb der Games-Speed-Gruppe. */
const REFERENCE_KEY = '5_10_linear';

/** Gehört die Metrik zur Games-Speed-Gruppe (5-10 Linear/90°/180°)? */
export function isGamesSpeedMetric(metric: MetricRow): boolean {
  return GAMES_SPEED_KEYS.has(metric.key);
}

export function isGamesSpeedReference(metric: MetricRow): boolean {
  return metric.key === REFERENCE_KEY;
}

export type DeficitEntry = {
  metric: MetricRow;
  value: number;
  date: string;
  /** value − Referenzwert (in Metrik-Einheit, i. d. R. Sekunden; positiv = langsamer). */
  absDeficit: number;
  /** absDeficit relativ zur Referenz, in Prozent. */
  pctDeficit: number;
};

export type DeficitReport = {
  reference: { metric: MetricRow; value: number; date: string };
  cuts: DeficitEntry[];
};

/**
 * Defizit der Cut-Varianten ggü. der Linear-Referenz.
 * `dailyByMetric` = Tagesbestwerte je metric.id, aufsteigend sortiert.
 * Gibt `null` zurück, wenn keine Referenz oder keine vergleichbaren Cuts vorliegen.
 */
export function computeDeficits(
  codMetrics: MetricRow[],
  dailyByMetric: Map<string, MeasurementRow[]>,
): DeficitReport | null {
  const last = (id: string): MeasurementRow | undefined => {
    const arr = dailyByMetric.get(id);
    return arr && arr.length > 0 ? arr[arr.length - 1] : undefined;
  };

  // Nur die Games-Speed-Gruppe vergleichen (5-0-5 / Pro Agility bleiben außen vor).
  const group = codMetrics.filter(isGamesSpeedMetric);
  const refMetric = group.find(isGamesSpeedReference);
  if (!refMetric) return null;
  const refRow = last(refMetric.id);
  if (!refRow) return null;

  const cuts: DeficitEntry[] = [];
  for (const m of group) {
    if (m.id === refMetric.id) continue;
    const row = last(m.id);
    if (!row) continue;
    const absDeficit = row.value - refRow.value;
    const pctDeficit = refRow.value !== 0 ? (absDeficit / refRow.value) * 100 : 0;
    cuts.push({ metric: m, value: row.value, date: row.tested_at, absDeficit, pctDeficit });
  }
  if (cuts.length === 0) return null;

  return {
    reference: { metric: refMetric, value: refRow.value, date: refRow.tested_at },
    cuts,
  };
}
