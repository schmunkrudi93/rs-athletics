'use client';

import { clsx } from '@/lib/clsx';
import { formatDelta, formatValue } from '@/lib/format';
import type { MetricStat } from '@/lib/metrics';

/** Kachel mit aktuellem Wert, PB-Markierung und Veränderung zum Vorwert. */
export function StatTile({
  stat,
  selected,
  onClick,
}: {
  stat: MetricStat;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { metric, latest, delta, improved, latestIsBest, count } = stat;
  const unit = metric.unit;

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
        {latestIsBest && count > 0 && (
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            PB
          </span>
        )}
      </div>

      <div className="stat-number text-3xl leading-none">
        {latest ? formatValue(latest.value, unit) : '–'}
      </div>

      <div className="text-xs">
        {delta != null ? (
          <span
            className={clsx(
              'inline-flex items-center gap-1 font-medium',
              improved ? 'text-success' : delta === 0 ? 'text-foreground-muted' : 'text-danger',
            )}
          >
            <span aria-hidden>{improved ? '↑' : delta === 0 ? '→' : '↓'}</span>
            {formatDelta(delta, unit)}
          </span>
        ) : count === 1 ? (
          <span className="text-foreground-subtle">Erster Wert</span>
        ) : (
          <span className="text-foreground-subtle">Noch kein Wert</span>
        )}
      </div>
    </button>
  );
}
