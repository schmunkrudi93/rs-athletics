'use client';

import { clsx } from '@/lib/clsx';
import { formatDate, formatValue } from '@/lib/format';
import { oneRepMaxBreakdown } from '@/lib/one-rep-max';
import type { MetricStat, Range } from '@/lib/metrics';

/** Kachel mit dem Bestwert (PB) der Metrik im gewählten Zeitfenster + Datum,
 *  darunter Ø im Fenster und der gleitende Schnitt der letzten ≥4 Wochen.
 *  Das Zeitfenster steuert der Schalter über dem Kachel-Raster. */
export function StatTile({
  stat,
  range,
  selected,
  onClick,
}: {
  stat: MetricStat;
  /** Gewähltes Kachel-Zeitfenster (für die Beschriftung des Schnitts). */
  range: Range;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { metric, best, count, average, recent } = stat;
  const unit = metric.unit;
  const breakdown = best ? oneRepMaxBreakdown(best.reps, best.weight, unit) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'card flex flex-col gap-2 p-4 text-left transition',
        selected ? 'border-accent ring-1 ring-accent/40' : 'hover:border-foreground-subtle/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-foreground-muted">{metric.label}</span>
        {best && count > 0 && (
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            PB
          </span>
        )}
      </div>

      <div className="flex flex-col">
        <span className="stat-number text-3xl leading-none">
          {best ? formatValue(best.value, unit) : '–'}
        </span>
        {breakdown && (
          <span className="mt-1.5 text-[11px] text-foreground-subtle">{breakdown}</span>
        )}
      </div>

      <div className="text-xs">
        {best ? (
          <span className="text-foreground-subtle">{formatDate(best.tested_at)}</span>
        ) : (
          <span className="text-foreground-subtle">Kein Wert</span>
        )}
      </div>

      {/* Durchschnitte: Ø im gewählten Zeitfenster + gleitender Schnitt (mind. 4 Wochen). */}
      {(average !== null || recent) && (
        <dl className="mt-auto flex flex-col gap-2 border-t border-line pt-2 text-xs">
          <AvgRow
            label={`Ø ${RANGE_TEXT[range]}`}
            hint={sessionsText(count)}
            value={average !== null ? formatValue(average, unit) : '–'}
          />
          <AvgRow
            label="Ø Form"
            hint={
              recent
                ? `${recent.capped ? '4 Monate' : `${recent.weeks} Wochen`} · ${sessionsText(recent.sessions)}`
                : 'keine Einheit in 4 Monaten'
            }
            value={recent ? formatValue(recent.value, unit) : '–'}
          />
        </dl>
      )}
    </button>
  );
}

// Zeitfenster-Schalter in Worten (Unterzeile des Fenster-Schnitts).
const RANGE_TEXT: Record<Range, string> = {
  '1M': '1 Monat',
  '3M': '3 Monate',
  '1Y': '1 Jahr',
  all: 'Gesamt',
};

function sessionsText(n: number): string {
  return n === 1 ? '1 Einheit' : `${n} Einheiten`;
}

/** Zeile: Bezeichnung links, Wert rechts; kleine Unterzeile über die volle Breite. */
function AvgRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="truncate text-foreground-muted">{label}</dt>
        <dd className="stat-number shrink-0 font-semibold text-foreground">{value}</dd>
      </div>
      <p className="text-[10px] leading-tight text-foreground-subtle">{hint}</p>
    </div>
  );
}
