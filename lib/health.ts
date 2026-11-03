import type { AthleteRow, MeasurementRow, MetricRow } from '@/lib/database.types';
import { dayKey, recentAverage } from '@/lib/metrics';

/**
 * Health-Reiter: Gewicht, Umfänge (+ Navy-KFA) und Herz (Ruhepuls/HRV).
 * Die Metriken liegen in der Kategorie 'health'; die Unterseite ergibt sich aus
 * dem key-Präfix (siehe SEED v5 in supabase/schema.sql).
 */

export type HealthPage = 'weight' | 'circ' | 'heart';

export const HEALTH_PAGES: { key: HealthPage; label: string; title: string }[] = [
  { key: 'weight', label: 'Gewicht', title: 'Gewicht' },
  { key: 'circ', label: 'Umfänge', title: 'Umfänge & Körperfett' },
  { key: 'heart', label: 'Herz', title: 'Ruhepuls & HRV' },
];

export const HEALTH_KEYS = {
  weight: 'body_weight',
  neck: 'circ_neck',
  waist: 'circ_waist',
  belly: 'circ_belly',
  hip: 'circ_hip',
  rhr: 'heart_rhr',
  hrv: 'heart_hrv',
} as const;

/** Zu welcher Unterseite gehört eine Health-Metrik? null = keine Health-Metrik. */
export function healthPageOf(metric: MetricRow): HealthPage | null {
  if (metric.category !== 'health') return null;
  if (metric.key.startsWith('circ_')) return 'circ';
  if (metric.key.startsWith('heart_')) return 'heart';
  return 'weight';
}

/** Letzter Roh-Wert (nach Datum, dann Erfassungszeit). `rows` beliebig sortiert. */
export function latestRow(rows: MeasurementRow[]): MeasurementRow | null {
  let latest: MeasurementRow | null = null;
  for (const r of rows) {
    if (
      !latest ||
      r.tested_at > latest.tested_at ||
      (r.tested_at === latest.tested_at && r.created_at > latest.created_at)
    ) {
      latest = r;
    }
  }
  return latest;
}

/** Ein Wert pro Tag = der zuletzt erfasste (für Health sinnvoller als ein
 *  „Tagesbestwert“). Ergebnis aufsteigend nach Datum. */
export function dailyLatest(rows: MeasurementRow[]): MeasurementRow[] {
  const byDay = new Map<string, MeasurementRow>();
  for (const r of rows) {
    const key = dayKey(r.tested_at);
    const cur = byDay.get(key);
    if (!cur || r.created_at > cur.created_at) byDay.set(key, r);
  }
  return [...byDay.values()].sort((a, b) => a.tested_at.localeCompare(b.tested_at));
}

// ---- Gewicht: gleitender 7-Tage-Schnitt -------------------------------------
// Tageswerte schwanken (Wasser, Salz, Essen) – aussagekräftig ist erst der
// Schnitt über 7 Kalendertage. Ein Fenster zählt nur mit mind. 3 Einträgen.

export const WEIGHT_WINDOW_DAYS = 7;
export const WEIGHT_WINDOW_MIN = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' -> Tagesnummer (UTC, zeitzonensicher für reine Datumswerte). */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export type WindowAverage = {
  /** null, wenn das Fenster weniger als WEIGHT_WINDOW_MIN Einträge hat. */
  value: number | null;
  /** Anzahl Tage mit Eintrag im Fenster. */
  count: number;
};

/** Schnitt der Tageswerte im Fenster [endDay − 6, endDay]. `dailyAsc` = ein Wert pro Tag. */
export function windowAverage(dailyAsc: MeasurementRow[], endIso: string): WindowAverage {
  const end = dayNumber(endIso);
  const start = end - (WEIGHT_WINDOW_DAYS - 1);
  let sum = 0;
  let count = 0;
  for (const r of dailyAsc) {
    const d = dayNumber(r.tested_at);
    if (d >= start && d <= end) {
      sum += r.value;
      count++;
    }
  }
  return { value: count >= WEIGHT_WINDOW_MIN ? sum / count : null, count };
}

/** Datum `days` Tage vor `iso` als 'YYYY-MM-DD'. */
function shiftIso(iso: string, days: number): string {
  return new Date((dayNumber(iso) - days) * DAY_MS).toISOString().slice(0, 10);
}

export type WeightTrend = {
  latest: MeasurementRow | null;
  /** Ø der letzten 7 Tage (ab heute). */
  current: WindowAverage;
  /** Ø-Veränderung zur Vorwoche (Tag 1–7 vs. 8–14), rollend. */
  weekDelta: number | null;
  /** Ø-Veränderung pro Woche über 4 Wochen (Tag 1–7 vs. 29–35, geteilt durch 4). */
  perWeek4: number | null;
};

/** Gewichtstrend aus den Tageswerten. Die Fenster hängen an HEUTE, nicht am
 *  letzten Eintrag – wer nicht mehr einträgt, bekommt keinen veralteten Schnitt. */
export function weightTrend(dailyAsc: MeasurementRow[], todayIso: string): WeightTrend {
  const current = windowAverage(dailyAsc, todayIso);
  const prev = windowAverage(dailyAsc, shiftIso(todayIso, 7));
  const fourAgo = windowAverage(dailyAsc, shiftIso(todayIso, 28));
  return {
    latest: dailyAsc[dailyAsc.length - 1] ?? null,
    current,
    weekDelta:
      current.value != null && prev.value != null ? current.value - prev.value : null,
    perWeek4:
      current.value != null && fourAgo.value != null ? (current.value - fourAgo.value) / 4 : null,
  };
}

/** 7-Tage-Ø je Eintragstag (für die Ø-Linie im Graph); null, solange das
 *  Fenster bis zu diesem Tag zu dünn ist. Gleiche Länge/Reihenfolge wie `dailyAsc`. */
export function rollingWeightSeries(dailyAsc: MeasurementRow[]): (number | null)[] {
  return dailyAsc.map((r) => windowAverage(dailyAsc, r.tested_at).value);
}

// ---- Gewicht: Kalenderwochen-Vergleich (KW, ISO 8601: Mo–So) ---------------

export type WeightWeek = {
  /** ISO-Kalenderwoche und ihr Jahr (KW 1 kann im Dezember beginnen). */
  week: number;
  year: number;
  /** Montag/Sonntag der Woche als 'YYYY-MM-DD'. */
  start: string;
  end: string;
  count: number;
  /** Ø der Woche; null bei weniger als WEIGHT_WINDOW_MIN Einträgen. */
  avg: number | null;
  /** Ø-Veränderung zur direkt vorherigen KW (beide mit genug Einträgen). */
  delta: number | null;
  /** delta in % des Vorwochen-Ø (übliches Maß fürs Diät-/Aufbautempo). */
  deltaPct: number | null;
  /** Die laufende Woche (noch nicht abgeschlossen). */
  current: boolean;
};

/** Montag (Tagesnummer) der ISO-Woche eines Tages. 1970-01-01 war ein Donnerstag. */
function mondayOf(day: number): number {
  const weekday = (((day + 3) % 7) + 7) % 7; // 0 = Montag … 6 = Sonntag
  return day - weekday;
}

/** ISO-Kalenderwoche + Jahr zu einem Montag (Tagesnummer). Maßgeblich ist der
 *  Donnerstag der Woche: in dessen Jahr liegt die KW. */
function isoWeekOf(monday: number): { week: number; year: number } {
  const thursday = new Date((monday + 3) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Math.round(Date.UTC(year, 0, 1) / DAY_MS);
  const week = Math.floor((monday + 3 - jan1) / 7) + 1;
  return { week, year };
}

const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Wochen-Ø je KW, neueste zuerst – von der laufenden Woche zurück bis zur
 *  ersten Woche mit Eintrag (Wochen ohne Eintrag erscheinen mit count = 0). */
export function weeklyWeight(dailyAsc: MeasurementRow[], todayIso: string): WeightWeek[] {
  if (dailyAsc.length === 0) return [];
  const byMonday = new Map<number, number[]>();
  for (const r of dailyAsc) {
    const mon = mondayOf(dayNumber(r.tested_at));
    const list = byMonday.get(mon);
    if (list) list.push(r.value);
    else byMonday.set(mon, [r.value]);
  }
  const currentMonday = mondayOf(dayNumber(todayIso));
  const firstMonday = mondayOf(dayNumber(dailyAsc[0].tested_at));

  const ascending: WeightWeek[] = [];
  for (let mon = firstMonday; mon <= currentMonday; mon += 7) {
    const values = byMonday.get(mon) ?? [];
    const avg =
      values.length >= WEIGHT_WINDOW_MIN ? values.reduce((s, v) => s + v, 0) / values.length : null;
    const prev = ascending[ascending.length - 1];
    const delta = avg != null && prev?.avg != null ? avg - prev.avg : null;
    ascending.push({
      ...isoWeekOf(mon),
      start: isoOf(mon),
      end: isoOf(mon + 6),
      count: values.length,
      avg,
      delta,
      deltaPct: delta != null && prev?.avg ? (delta / prev.avg) * 100 : null,
      current: mon === currentMonday,
    });
  }
  return ascending.reverse();
}

// ---- Herz: letzter Wert vs. persönlicher Normalwert -------------------------

export type HeartStatus = {
  latest: MeasurementRow;
  /** Gleitender Schnitt (≥ 4 Wochen, mind. 5 Messungen – wie bei den Kacheln). */
  baseline: number | null;
  /** Abweichung des letzten Werts vom Normalwert in % (vorzeichenbehaftet). */
  pctDiff: number | null;
  /** 'none' = im Rahmen, 'warn' = deutlich in die ungünstige Richtung, 'high' = stark. */
  severity: 'none' | 'warn' | 'high';
};

// Orientierungswerte (bewusst grob): ungünstige Abweichung vom eigenen Schnitt.
const HEART_WARN_PCT = 7;
const HEART_HIGH_PCT = 15;

/** Status von Ruhepuls/HRV. „Ungünstig“ = Ruhepuls höher bzw. HRV niedriger als normal.
 *  Der Normalwert wird ohne den letzten Tag berechnet, damit er sich nicht selbst misst. */
export function heartStatus(metric: MetricRow, rows: MeasurementRow[]): HeartStatus | null {
  const daily = dailyLatest(rows);
  const latest = daily[daily.length - 1];
  if (!latest) return null;
  const history = daily.slice(0, -1);
  const recent = history.length >= 3 ? recentAverage(history) : null;
  const baseline = recent?.value ?? null;
  const pctDiff = baseline ? ((latest.value - baseline) / baseline) * 100 : null;
  // In ungünstige Richtung (positiv = schlechter): Ruhepuls hoch, HRV runter.
  const adverse = pctDiff == null ? 0 : metric.higher_is_better ? -pctDiff : pctDiff;
  const severity = adverse >= HEART_HIGH_PCT ? 'high' : adverse >= HEART_WARN_PCT ? 'warn' : 'none';
  return { latest, baseline, pctDiff, severity };
}

// ---- Navy-Körperfett (US Navy Circumference Method, metrisch) ---------------

export type NavyInputs = {
  sex: 'm' | 'f';
  heightCm: number;
  neckCm: number;
  /** Männer: Bauch (Höhe Nabel); Frauen: Taille (schmalste Stelle). */
  waistCm: number;
  /** Nur Frauen. */
  hipCm?: number;
};

/** Körperfett in % nach der Navy-Formel (Hodgdon & Beckett), cm-Variante.
 *  null, wenn die Eingaben keinen sinnvollen Wert ergeben. */
export function navyBodyFat({ sex, heightCm, neckCm, waistCm, hipCm }: NavyInputs): number | null {
  let bf: number;
  if (sex === 'm') {
    const diff = waistCm - neckCm;
    if (!(diff > 0) || !(heightCm > 0)) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (hipCm == null) return null;
    const sum = waistCm + hipCm - neckCm;
    if (!(sum > 0) || !(heightCm > 0)) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.221 * Math.log10(heightCm)) - 450;
  }
  return Number.isFinite(bf) && bf > 0 && bf < 75 ? bf : null;
}

export type BodyFatPoint = {
  date: string;
  value: number;
  /** Welche Rumpf-Messung verwendet wurde (für den Hinweis unter dem Wert). */
  trunkLabel: string;
};

export type BodyFatResult =
  | { ok: true; points: BodyFatPoint[] }
  | { ok: false; reason: 'profile' | 'measurements'; missing: string[] };

/**
 * KFA-Verlauf aus den Umfängen: ein Punkt je Tag mit Rumpf-Messung (Männer: Bauch,
 * ersatzweise Taille; Frauen: Taille, ersatzweise Bauch). Hals/Hüfte dürfen von
 * einem früheren Tag stammen – es zählt jeweils der letzte Wert bis zu diesem Tag.
 */
export function bodyFatSeries(
  athlete: Pick<AthleteRow, 'sex' | 'height_cm'> | null,
  metrics: MetricRow[],
  grouped: Map<string, MeasurementRow[]>,
): BodyFatResult {
  const sex = athlete?.sex ?? null;
  const height = athlete?.height_cm ?? null;
  if (!sex || !height) {
    const missing = [!height && 'Größe', !sex && 'Geschlecht'].filter(Boolean) as string[];
    return { ok: false, reason: 'profile', missing };
  }

  const rowsFor = (key: string) => {
    const m = metrics.find((x) => x.key === key);
    return m ? dailyLatest(grouped.get(m.id) ?? []) : [];
  };
  const labelFor = (key: string) => metrics.find((x) => x.key === key)?.label ?? key;

  const [primaryKey, fallbackKey] =
    sex === 'm' ? [HEALTH_KEYS.belly, HEALTH_KEYS.waist] : [HEALTH_KEYS.waist, HEALTH_KEYS.belly];
  let trunkKey: string = primaryKey;
  let trunk = rowsFor(primaryKey);
  if (trunk.length === 0) {
    trunkKey = fallbackKey;
    trunk = rowsFor(fallbackKey);
  }
  const neck = rowsFor(HEALTH_KEYS.neck);
  const hip = sex === 'f' ? rowsFor(HEALTH_KEYS.hip) : [];

  const missing = [
    neck.length === 0 && labelFor(HEALTH_KEYS.neck),
    trunk.length === 0 && labelFor(primaryKey),
    sex === 'f' && hip.length === 0 && labelFor(HEALTH_KEYS.hip),
  ].filter(Boolean) as string[];
  if (missing.length > 0) return { ok: false, reason: 'measurements', missing };

  const lastUpTo = (rows: MeasurementRow[], date: string) => {
    let found: MeasurementRow | null = null;
    for (const r of rows) if (r.tested_at <= date) found = r;
    return found;
  };

  const points: BodyFatPoint[] = [];
  for (const t of trunk) {
    const n = lastUpTo(neck, t.tested_at);
    const h = sex === 'f' ? lastUpTo(hip, t.tested_at) : null;
    if (!n || (sex === 'f' && !h)) continue;
    const value = navyBodyFat({
      sex,
      heightCm: height,
      neckCm: n.value,
      waistCm: t.value,
      hipCm: h?.value,
    });
    if (value != null) points.push({ date: t.tested_at, value, trunkLabel: labelFor(trunkKey) });
  }
  if (points.length === 0) return { ok: false, reason: 'measurements', missing: [] };
  return { ok: true, points };
}
