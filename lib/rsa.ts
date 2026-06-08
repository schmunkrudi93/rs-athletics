/**
 * RSA (Repeated Sprint Ability): pro Test-Session werden MEHRERE Sprintzeiten als
 * einzelne `measurements` mit gleichem `tested_at` gespeichert. Erkennung am
 * metric.key-Präfix `rsa_`. Niedriger = besser.
 *
 * Eine „Session" = alle Sprints eines Tages, in Lauf-Reihenfolge (= Eingabe-
 * reihenfolge via created_at). Daraus werden Ermüdungs-Kennzahlen abgeleitet;
 * die Roh-Werte bleiben unangetastet.
 */

import type { MeasurementRow, MetricRow } from '@/lib/database.types';

/** Gehört die Metrik zu den RSA-Tests (mehrere Sprints je Session)? */
export function isRsaMetric(metric: MetricRow): boolean {
  return metric.key.startsWith('rsa_');
}

export type RsaSession = {
  /** Testtag (YYYY-MM-DD). */
  date: string;
  /** Roh-Zeilen in Lauf-Reihenfolge (für Bearbeiten/Löschen). */
  rows: MeasurementRow[];
  /** Sprintzeiten in Lauf-Reihenfolge. */
  sprints: number[];
  /** Schnellste Zeit (Minimum). */
  best: number;
  /** Langsamste Zeit (Maximum). */
  worst: number;
  /** Durchschnittszeit. */
  avg: number;
  /** Fatigue: ((Ø − Best) / Best) × 100. Hauptkennzahl. */
  fatiguePct: number;
  /** ((Worst − Best) / Best) × 100. */
  bestVsWorstPct: number;
  /** ((Ø letzte 2 − Ø erste 2) / Ø erste 2) × 100; null bei < 4 Sprints. */
  firstVsLastPct: number | null;
};

/**
 * Baut die Sessions (= Tage) eines RSA-Tests aus den Roh-Werten, neueste zuerst.
 * Pro Session werden Best/Worst/Ø sowie die Ermüdungs-Prozente berechnet.
 */
export function buildRsaSessions(rows: MeasurementRow[]): RsaSession[] {
  const byDay = new Map<string, MeasurementRow[]>();
  for (const r of rows) {
    const key = r.tested_at.slice(0, 10);
    const list = byDay.get(key);
    if (list) list.push(r);
    else byDay.set(key, [r]);
  }

  const sessions: RsaSession[] = [];
  for (const [date, list] of byDay) {
    // Lauf-Reihenfolge = Eingabereihenfolge (created_at).
    const ordered = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const sprints = ordered.map((r) => r.value);
    if (sprints.length === 0) continue;

    const best = Math.min(...sprints);
    const worst = Math.max(...sprints);
    const avg = sprints.reduce((sum, v) => sum + v, 0) / sprints.length;
    const fatiguePct = best > 0 ? ((avg - best) / best) * 100 : 0;
    const bestVsWorstPct = best > 0 ? ((worst - best) / best) * 100 : 0;

    let firstVsLastPct: number | null = null;
    if (sprints.length >= 4) {
      const firstTwo = (sprints[0] + sprints[1]) / 2;
      const lastTwo = (sprints[sprints.length - 1] + sprints[sprints.length - 2]) / 2;
      firstVsLastPct = firstTwo > 0 ? ((lastTwo - firstTwo) / firstTwo) * 100 : 0;
    }

    sessions.push({
      date,
      rows: ordered,
      sprints,
      best,
      worst,
      avg,
      fatiguePct,
      bestVsWorstPct,
      firstVsLastPct,
    });
  }

  sessions.sort((a, b) => b.date.localeCompare(a.date));
  return sessions;
}
