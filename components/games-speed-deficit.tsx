'use client';

import { formatDate, formatDelta, formatPercentDelta, formatValue } from '@/lib/format';
import type { DeficitReport } from '@/lib/games-speed';

/**
 * Defizit-Karte für die Richtungswechsel-Kategorie: zeigt die Linear-Referenz und
 * je Cut-Variante, wie viel langsamer sie ist (Δ Zeit und %). Verglichen wird der
 * jeweils letzte Tagesbestwert (Datum wird mit ausgewiesen, da die Tests an
 * verschiedenen Tagen liegen können).
 */
export function GamesSpeedDeficit({ report }: { report: DeficitReport | null }) {
  if (!report) return null;
  const { reference, cuts } = report;

  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="font-display text-lg font-semibold text-foreground">Game Speed Deficiency</h2>

      <ul className="flex flex-col divide-y divide-line">
        {/* Referenz (linearer 5-10 Sprint) – gleiche Darstellung wie die Cut-Varianten */}
        <li className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{reference.metric.label}</p>
            <p className="text-xs text-foreground-subtle">
              {formatValue(reference.value, reference.metric.unit)} · {formatDate(reference.date)}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
            Referenz
          </span>
        </li>

        {cuts.map((c) => (
          <li key={c.metric.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{c.metric.label}</p>
              <p className="text-xs text-foreground-subtle">
                {formatValue(c.value, c.metric.unit)} · {formatDate(c.date)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="stat-number text-base text-foreground">
                {formatDelta(c.absDeficit, c.metric.unit)}
              </p>
              <p className="text-xs text-foreground-subtle">{formatPercentDelta(c.pctDeficit)}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-snug text-foreground-subtle">
        Defizit = wie viel langsamer als der lineare 5-10 Sprint. Kleiner ist besser.
      </p>
    </section>
  );
}
