'use client';

import { formatPercent, formatValue } from '@/lib/format';
import { buildRsaSessions } from '@/lib/rsa';
import type { MeasurementRow, MetricRow } from '@/lib/database.types';

/**
 * Kachel für einen RSA-Test: zeigt Fatigue % und Ø-Zeit der letzten Session.
 * Tippen öffnet die RSA-Detailansicht (Leistung + Fatigue + Einzel-Sprints).
 */
export function RsaTile({
  metric,
  rows,
  onClick,
}: {
  metric: MetricRow;
  rows: MeasurementRow[];
  onClick?: () => void;
}) {
  const latest = buildRsaSessions(rows)[0] ?? null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex flex-col gap-2 p-4 text-left transition hover:border-foreground-subtle/40"
    >
      <span className="text-xs font-medium text-foreground-muted">{metric.label}</span>

      <div className="stat-number text-3xl leading-none">
        {latest ? formatPercent(latest.fatiguePct) : '–'}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-foreground-subtle">
        <span>
          {latest ? `Fatigue · Ø ${formatValue(latest.avg, metric.unit)}` : 'Noch kein Test'}
        </span>
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </div>
    </button>
  );
}
