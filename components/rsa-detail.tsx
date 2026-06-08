'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { clsx } from '@/lib/clsx';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import {
  formatDate,
  formatDateShort,
  formatPercent,
  formatPercentDelta,
  formatValue,
} from '@/lib/format';
import { buildRsaSessions } from '@/lib/rsa';
import type { MeasurementRow, MetricRow } from '@/lib/database.types';

/**
 * RSA-Detailansicht: pro Session (= Testtag) eine Leistungs- und eine
 * Fatigue-Übersicht plus die Einzel-Sprints in Lauf-Reihenfolge. Mehrere
 * Sessions sind oben per Datum umschaltbar (neueste zuerst).
 */
export function RsaDetail({
  metric,
  rawRows,
  enableEdit = false,
  canEditRow = () => true,
  onEdit,
  enableEntry = false,
  onAdd,
}: {
  metric: MetricRow;
  rawRows: MeasurementRow[];
  enableEdit?: boolean;
  canEditRow?: (m: MeasurementRow) => boolean;
  onEdit?: (m: MeasurementRow) => void;
  enableEntry?: boolean;
  onAdd?: () => void;
}) {
  const sessions = useMemo(() => buildRsaSessions(rawRows), [rawRows]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const session = sessions.find((s) => s.date === selectedDate) ?? sessions[0] ?? null;
  const unit = metric.unit;

  if (!session) {
    return (
      <div className="card flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-foreground-muted">
          Noch kein RSA-Test erfasst. Trage die Sprintzeiten einer Session über „+ Eintragen“ ein –
          alle mit demselben Datum.
        </p>
        {enableEntry && onAdd && (
          <Button size="sm" variant="outline" onClick={onAdd}>
            Ersten Test eintragen
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sessions.length > 1 && (
        <div className="overflow-x-auto">
          <Segmented
            className="whitespace-nowrap"
            options={sessions.map((s) => ({ key: s.date, label: formatDateShort(s.date) }))}
            value={session.date}
            onChange={(d) => setSelectedDate(d)}
          />
        </div>
      )}

      {/* Leistung */}
      <section className="card flex flex-col gap-3 p-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Leistung</h2>
          <p className="text-xs text-foreground-subtle">
            {formatDate(session.date)} · {session.sprints.length} Sprints
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Bestzeit" value={formatValue(session.best, unit)} />
          <MiniStat label="Ø-Zeit" value={formatValue(session.avg, unit)} />
          <MiniStat label="Schlechteste" value={formatValue(session.worst, unit)} />
        </div>
      </section>

      {/* Fatigue */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Fatigue</h2>
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Fatigue" hint="Ø vs. Best" value={formatPercent(session.fatiguePct)} />
          <MiniStat
            label="Abfall"
            hint="erste 2 → letzte 2"
            value={session.firstVsLastPct == null ? '–' : formatPercentDelta(session.firstVsLastPct)}
          />
          <MiniStat
            label="Spanne"
            hint="Best → Worst"
            value={formatPercent(session.bestVsWorstPct)}
          />
        </div>
        <p className="text-[11px] leading-snug text-foreground-subtle">
          Fatigue = wie viel über der schnellsten Zeit der Schnitt liegt. Kleiner ist besser.
        </p>
      </section>

      {/* Einzel-Sprints */}
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Sprints</h2>
        <ul className="flex flex-col divide-y divide-line">
          {session.rows.map((r, i) => {
            const isBest = r.value === session.best;
            const isWorst = !isBest && r.value === session.worst;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="w-16 text-xs text-foreground-subtle">Sprint {i + 1}</span>
                  {isBest && <Tag tone="accent">Schnellste</Tag>}
                  {isWorst && <Tag tone="muted">Langsamste</Tag>}
                </span>
                <span className="flex items-center gap-2">
                  {enableEdit && onEdit && canEditRow(r) && (
                    <PencilButton onClick={() => onEdit(r)} />
                  )}
                  <span
                    className={clsx(
                      'stat-number text-base',
                      isBest ? 'font-semibold text-accent' : 'text-foreground',
                    )}
                  >
                    {formatValue(r.value, unit)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** Kleine Kennzahl-Kachel (Label + Wert + optionaler Hinweis). */
function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-surface-muted px-3 py-2.5">
      <span className="text-[11px] font-medium text-foreground-muted">{label}</span>
      <span className="stat-number text-lg text-foreground">{value}</span>
      {hint && <span className="text-[10px] leading-tight text-foreground-subtle">{hint}</span>}
    </div>
  );
}

function Tag({ children, tone }: { children: ReactNode; tone: 'accent' | 'muted' }) {
  return (
    <span
      className={clsx(
        'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-surface-muted text-foreground-subtle',
      )}
    >
      {children}
    </span>
  );
}

function PencilButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Wert bearbeiten"
      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3z" />
      </svg>
    </button>
  );
}
