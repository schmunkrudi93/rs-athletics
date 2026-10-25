import type { MeasurementRow, MetricRow } from '@/lib/database.types';

/** Zeitfenster für Verlauf/Chart. */
export type Range = '1M' | '3M' | '1Y' | 'all';

export const RANGES: { key: Range; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '1Y', label: '1J' },
  { key: 'all', label: 'Alle' },
];

const RANGE_DAYS: Record<Exclude<Range, 'all'>, number> = {
  '1M': 30,
  '3M': 91,
  '1Y': 365,
};

/** Kennzahlen einer einzelnen Metrik (über die gesamte Historie). */
export type MetricStat = {
  metric: MetricRow;
  count: number;
  latest: MeasurementRow | null;
  previous: MeasurementRow | null;
  best: MeasurementRow | null;
  /** latest.value − previous.value (vorzeichenbehaftet, in Metrik-Einheit). */
  delta: number | null;
  /** Ist der letzte Wert besser als der vorherige? (beachtet higher_is_better) */
  improved: boolean | null;
  /** Ist der letzte Wert die persönliche Bestleistung? */
  latestIsBest: boolean;
  /** Durchschnitt aller Einheiten im gewählten Zeitfenster (null = keine Werte). */
  average: number | null;
  /** Gleitender Schnitt der jüngsten Einheiten (unabhängig vom Zeitfenster). */
  recent: RecentAverage | null;
};

/** Ergebnis von `recentAverage`. */
export type RecentAverage = {
  value: number;
  /** Anzahl der Einheiten (Trainingstage) im Fenster. */
  sessions: number;
  /** Fensterlänge in Wochen (4 … ~17); bei `capped` = 4-Monats-Grenze erreicht. */
  weeks: number;
  capped: boolean;
};

// Parameter des gleitenden Schnitts: Start mit 4 Wochen, so lange wochenweise
// nach hinten erweitern, bis mindestens 5 Einheiten drin sind – höchstens 4 Monate.
const RECENT_BASE_WEEKS = 4;
const RECENT_MIN_SESSIONS = 5;
const RECENT_MAX_MONTHS = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function mean(rows: Pick<MeasurementRow, 'value'>[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((sum, r) => sum + r.value, 0) / rows.length;
}

/**
 * Gleitender Schnitt der letzten 4 Wochen (ab heute). Sind darin weniger als
 * 5 Einheiten, wird das Fenster wochenweise erweitert, bis 5 erreicht sind –
 * maximal bis 4 Monate zurück. Eingabe: Tageswerte (`dailyBest`), d. h. ein
 * Eintrag = eine Einheit. Ohne Einheit in den letzten 4 Monaten → null.
 */
export function recentAverage(
  dailyAsc: Pick<MeasurementRow, 'tested_at' | 'value'>[],
  now: number = Date.now(),
): RecentAverage | null {
  const limitDate = new Date(now);
  limitDate.setMonth(limitDate.getMonth() - RECENT_MAX_MONTHS);
  const limit = limitDate.getTime();

  for (let weeks = RECENT_BASE_WEEKS; ; weeks++) {
    const cutoff = now - weeks * WEEK_MS;
    const capped = cutoff <= limit;
    const from = capped ? limit : cutoff;
    const rows = dailyAsc.filter((m) => new Date(m.tested_at).getTime() >= from);
    if (rows.length >= RECENT_MIN_SESSIONS || capped) {
      const value = mean(rows);
      return value === null ? null : { value, sessions: rows.length, weeks, capped };
    }
  }
}

/** Messwerte nach metric_id gruppieren, je Gruppe aufsteigend nach Datum. */
export function groupByMetric(measurements: MeasurementRow[]): Map<string, MeasurementRow[]> {
  const map = new Map<string, MeasurementRow[]>();
  for (const m of measurements) {
    const list = map.get(m.metric_id);
    if (list) list.push(m);
    else map.set(m.metric_id, [m]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.tested_at.localeCompare(b.tested_at));
  }
  return map;
}

/** Hat eine Messung eine nicht-leere Notiz? */
export function hasNote(note: string | null | undefined): note is string {
  return typeof note === 'string' && note.trim().length > 0;
}

/** Kalendertag (YYYY-MM-DD) eines Messwerts – Basis der Tages-Aggregation.
 *  `tested_at` ist ein DATE ('YYYY-MM-DD'); der Datumsanteil ist direkt der
 *  Tagesschlüssel (zeitzonensicher). Volle ISO-Strings werden ebenfalls korrekt
 *  auf ihren Datumsanteil reduziert. */
export function dayKey(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (match) return match[1];
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Tagesvergleich: besserer Wert gewinnt; bei Gleichstand der mit Notiz, dann der spätere. */
function isDailyBetter(
  candidate: MeasurementRow,
  current: MeasurementRow,
  higherIsBetter: boolean,
): boolean {
  if (candidate.value !== current.value) {
    return isBetter(candidate.value, current.value, higherIsBetter);
  }
  const candNote = hasNote(candidate.note);
  if (candNote !== hasNote(current.note)) return candNote;
  return candidate.tested_at > current.tested_at;
}

/**
 * Reduziert eine (aufsteigend sortierte) Roh-Messreihe auf einen Eintrag pro
 * Kalendertag: den Tagesbestwert gemäß `higherIsBetter`. Reine Anzeige-Aggregation –
 * die Roh-Einträge in der DB bleiben unangetastet. Ergebnis aufsteigend nach Datum.
 */
export function dailyBest(sortedAsc: MeasurementRow[], higherIsBetter: boolean): MeasurementRow[] {
  const byDay = new Map<string, MeasurementRow>();
  for (const row of sortedAsc) {
    const key = dayKey(row.tested_at);
    const current = byDay.get(key);
    if (!current || isDailyBetter(row, current, higherIsBetter)) byDay.set(key, row);
  }
  return [...byDay.values()].sort((a, b) => a.tested_at.localeCompare(b.tested_at));
}

/** Ist a besser als b? (höher oder niedriger je nach Metrik) */
export function isBetter(a: number, b: number, higherIsBetter: boolean): boolean {
  return higherIsBetter ? a > b : a < b;
}

/** Bestleistung aus einer (aufsteigend sortierten) Messreihe. */
function bestOf(sortedAsc: MeasurementRow[], higherIsBetter: boolean): MeasurementRow | null {
  if (sortedAsc.length === 0) return null;
  let best = sortedAsc[0];
  for (const m of sortedAsc) {
    if (isBetter(m.value, best.value, higherIsBetter)) best = m;
  }
  return best;
}

/** Kennzahlen für eine Metrik berechnen. `sortedAsc` = aufsteigend nach Datum.
 *  `recent` wird separat (auf der vollen Historie) berechnet und nur durchgereicht. */
export function computeStat(
  metric: MetricRow,
  sortedAsc: MeasurementRow[],
  recent: RecentAverage | null = null,
): MetricStat {
  const count = sortedAsc.length;
  const latest = count > 0 ? sortedAsc[count - 1] : null;
  const previous = count > 1 ? sortedAsc[count - 2] : null;
  const best = bestOf(sortedAsc, metric.higher_is_better);

  const delta = latest && previous ? latest.value - previous.value : null;
  const improved =
    latest && previous ? isBetter(latest.value, previous.value, metric.higher_is_better) : null;
  const latestIsBest = !!latest && !!best && latest.id === best.id;

  return {
    metric,
    count,
    latest,
    previous,
    best,
    delta,
    improved,
    latestIsBest,
    average: mean(sortedAsc),
    recent,
  };
}

/** Messreihe auf ein Zeitfenster eingrenzen (Eingabe aufsteigend sortiert). */
export function filterByRange(
  sortedAsc: MeasurementRow[],
  range: Range,
  now: number = Date.now(),
): MeasurementRow[] {
  if (range === 'all') return sortedAsc;
  const cutoff = now - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  return sortedAsc.filter((m) => new Date(m.tested_at).getTime() >= cutoff);
}

/** Metriken stabil sortieren (sort_order, dann Label). */
export function sortMetrics(metrics: MetricRow[]): MetricRow[] {
  return [...metrics].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'de'),
  );
}
