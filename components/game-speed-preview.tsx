'use client';

import { formatDelta } from '@/lib/format';
import type { DeficitReport } from '@/lib/games-speed';

/** „5-10 90°" -> „90°" für die kompakte Darstellung. */
function shortLabel(label: string): string {
  return label.replace(/^5-10\s*/, '') || label;
}

/**
 * Kleine, immer sichtbare Vorschau im Richtungswechsel-Reiter. Tippen öffnet die
 * Game-Speed-Detailansicht. Zeigt – falls vorhanden – die Defizite kompakt,
 * sonst einen Hinweis, dass noch keine Werte erfasst sind.
 */
export function GameSpeedPreview({
  report,
  onOpen,
}: {
  report: DeficitReport | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex items-center justify-between gap-3 p-4 text-left transition hover:border-foreground-subtle/40"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Game Speed</p>
        {report ? (
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            {report.cuts
              .map((c) => `${shortLabel(c.metric.label)} ${formatDelta(c.absDeficit, c.metric.unit)}`)
              .join(' · ')}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-foreground-subtle">
            Defizit-Auswertung · noch keine Werte
          </p>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
        Details
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </span>
    </button>
  );
}
