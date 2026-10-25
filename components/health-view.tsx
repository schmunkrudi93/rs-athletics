'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { clsx } from '@/lib/clsx';
import { formatDate, formatDelta, formatPercentDelta, formatValue } from '@/lib/format';
import { sortMetrics } from '@/lib/metrics';
import { supportsSide } from '@/lib/laterality';
import {
  HEALTH_KEYS,
  bodyFatSeries,
  dailyLatest,
  healthPageOf,
  heartStatus,
  latestRow,
  valueDaysBefore,
  type BodyFatResult,
  type HealthPage,
  type HeartStatus,
} from '@/lib/health';
import type { AthleteRow, MeasurementRow, MetricRow } from '@/lib/database.types';

const TrendChart = dynamic(() => import('@/components/trend-chart').then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-surface" />,
});

/** Pseudo-Metrik, damit der vorhandene TrendChart den KFA-Verlauf zeichnen kann. */
const BODY_FAT_METRIC: MetricRow = {
  id: 'body_fat',
  key: 'body_fat',
  label: 'Körperfett (Navy)',
  category: 'health',
  unit: '%',
  higher_is_better: false,
  sort_order: 0,
  is_custom: false,
  is_active: true,
  created_by: null,
  created_at: '',
};

const SEVERITY_TEXT: Record<HeartStatus['severity'], string> = {
  none: 'text-foreground',
  warn: 'text-warning',
  high: 'text-danger',
};

type Shared = {
  athlete: AthleteRow | null;
  /** Nur Health-Metriken (Kategorie 'health'). */
  metrics: MetricRow[];
  grouped: Map<string, MeasurementRow[]>;
};

/** Wie formatDelta, aber „±0“ bei unverändertem Wert (statt einer nackten „0 cm“). */
function signedDelta(delta: number, unit: string): string {
  return Math.abs(delta) < 0.05 ? `±0 ${unit}` : formatDelta(delta, unit);
}

function byKey(metrics: MetricRow[], key: string) {
  return metrics.find((m) => m.key === key) ?? null;
}

function metricsOfPage(metrics: MetricRow[], page: HealthPage) {
  return sortMetrics(metrics.filter((m) => healthPageOf(m) === page));
}

// ============================================================================
// Übersicht im Health-Reiter: drei Karten, Tippen öffnet die Unterseite.
// ============================================================================

export function HealthOverview({
  athlete,
  metrics,
  grouped,
  onOpen,
}: Shared & { onOpen: (page: HealthPage) => void }) {
  const weightMetric = byKey(metrics, HEALTH_KEYS.weight);
  const weightDaily = useMemo(
    () => (weightMetric ? dailyLatest(grouped.get(weightMetric.id) ?? []) : []),
    [weightMetric, grouped],
  );
  const weightLatest = weightDaily[weightDaily.length - 1] ?? null;
  const weightBefore = valueDaysBefore(weightDaily, 28);

  const bodyFat = useMemo(() => bodyFatSeries(athlete, metrics, grouped), [athlete, metrics, grouped]);
  const bfPoints = bodyFat.ok ? bodyFat.points : [];
  const bfLatest = bfPoints[bfPoints.length - 1] ?? null;
  const bfPrev = bfPoints[bfPoints.length - 2] ?? null;
  const anyCirc = metricsOfPage(metrics, 'circ').some((m) => (grouped.get(m.id)?.length ?? 0) > 0);

  const rhrMetric = byKey(metrics, HEALTH_KEYS.rhr);
  const hrvMetric = byKey(metrics, HEALTH_KEYS.hrv);
  const rhr = rhrMetric ? heartStatus(rhrMetric, grouped.get(rhrMetric.id) ?? []) : null;
  const hrv = hrvMetric ? heartStatus(hrvMetric, grouped.get(hrvMetric.id) ?? []) : null;

  return (
    <section className="flex flex-col gap-3">
      <OverviewCard
        title="Gewicht"
        onClick={() => onOpen('weight')}
        value={weightLatest ? formatValue(weightLatest.value, 'kg') : null}
        sub={
          weightLatest
            ? weightBefore
              ? `${signedDelta(weightLatest.value - weightBefore.value, 'kg')} in 4 Wochen`
              : `Stand ${formatDate(weightLatest.tested_at)}`
            : null
        }
        empty="Gewichtsverlauf tracken"
      />
      <OverviewCard
        title="Umfänge & Körperfett"
        onClick={() => onOpen('circ')}
        value={bfLatest ? formatValue(bfLatest.value, '%') : null}
        sub={
          bfLatest
            ? bfPrev
              ? `KFA (Navy) · ${signedDelta(bfLatest.value - bfPrev.value, '%')} zur letzten Messung`
              : `KFA (Navy) · Stand ${formatDate(bfLatest.date)}`
            : anyCirc
              ? bodyFatHint(bodyFat)
              : null
        }
        empty="Umfänge eintragen · Körperfett nach Navy-Formel"
        forceSub={anyCirc}
      />
      <OverviewCard
        title="Ruhepuls & HRV"
        onClick={() => onOpen('heart')}
        value={
          rhr || hrv ? (
            <span className="flex items-baseline gap-4">
              <HeartValue status={rhr} unit="bpm" />
              <HeartValue status={hrv} unit="ms" />
            </span>
          ) : null
        }
        sub={rhr || hrv ? 'Farbe = Abweichung vom eigenen Schnitt' : null}
        empty="Ruhepuls und HRV morgens eintragen"
      />
    </section>
  );
}

function HeartValue({ status, unit }: { status: HeartStatus | null; unit: string }) {
  if (!status) return <span className="text-foreground-subtle">– {unit}</span>;
  return (
    <span className={SEVERITY_TEXT[status.severity]}>{formatValue(status.latest.value, unit)}</span>
  );
}

function OverviewCard({
  title,
  value,
  sub,
  empty,
  forceSub = false,
  onClick,
}: {
  title: string;
  value: ReactNode | null;
  sub: string | null;
  empty: string;
  /** Untertitel auch ohne Wert zeigen (z. B. „Größe fehlt“). */
  forceSub?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex items-center justify-between gap-3 p-4 text-left transition hover:border-foreground-subtle/40"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground-muted">{title}</p>
        {value ? (
          <>
            <div className="stat-number mt-1 text-2xl leading-tight">{value}</div>
            {sub && <p className="mt-0.5 truncate text-xs text-foreground-subtle">{sub}</p>}
          </>
        ) : (
          <p className="mt-1 text-sm text-foreground-subtle">
            {forceSub && sub ? sub : empty}
          </p>
        )}
      </div>
      <ChevronRight />
    </button>
  );
}

function bodyFatHint(result: BodyFatResult): string | null {
  if (result.ok) return null;
  if (result.reason === 'profile') {
    return `Für den KFA fehlt im Profil: ${result.missing.join(' & ')} (trägt der Coach ein)`;
  }
  return result.missing.length > 0
    ? `Für den KFA fehlt noch: ${result.missing.join(', ')}`
    : 'KFA nicht berechenbar – Werte prüfen';
}

// ============================================================================
// Unterseiten (Gewicht / Umfänge / Herz)
// ============================================================================

export function HealthDetail({
  page,
  athlete,
  metrics,
  grouped,
  renderDetail,
}: Shared & {
  page: HealthPage;
  /** Verlauf + Historie einer Metrik (MetricDetailSection aus dem Dashboard). */
  renderDetail: (metric: MetricRow, rows: MeasurementRow[]) => ReactNode;
}) {
  const pageMetrics = useMemo(() => metricsOfPage(metrics, page), [metrics, page]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auswahl gültig halten: beim Seitenwechsel erste Metrik mit Daten wählen.
  useEffect(() => {
    if (pageMetrics.some((m) => m.id === selectedId)) return;
    const withData = pageMetrics.find((m) => (grouped.get(m.id)?.length ?? 0) > 0);
    setSelectedId((withData ?? pageMetrics[0])?.id ?? null);
  }, [pageMetrics, grouped, selectedId]);

  const selected = pageMetrics.find((m) => m.id === selectedId) ?? null;

  return (
    <>
      {page === 'weight' && <WeightSummary metric={selected} grouped={grouped} />}
      {page === 'circ' && (
        <>
          <BodyFatCard athlete={athlete} metrics={metrics} grouped={grouped} />
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pageMetrics.map((m) => (
              <CircTile
                key={m.id}
                metric={m}
                rows={grouped.get(m.id) ?? []}
                selected={m.id === selectedId}
                onClick={() => setSelectedId(m.id)}
              />
            ))}
          </section>
        </>
      )}
      {page === 'heart' && (
        <section className="grid grid-cols-2 gap-3">
          {pageMetrics.map((m) => (
            <HeartTile
              key={m.id}
              metric={m}
              status={heartStatus(m, grouped.get(m.id) ?? [])}
              selected={m.id === selectedId}
              onClick={() => setSelectedId(m.id)}
            />
          ))}
        </section>
      )}

      {selected && renderDetail(selected, grouped.get(selected.id) ?? [])}
    </>
  );
}

function WeightSummary({
  metric,
  grouped,
}: {
  metric: MetricRow | null;
  grouped: Map<string, MeasurementRow[]>;
}) {
  const daily = metric ? dailyLatest(grouped.get(metric.id) ?? []) : [];
  const latest = daily[daily.length - 1];
  if (!latest) return null;
  const w1 = valueDaysBefore(daily, 7);
  const w4 = valueDaysBefore(daily, 28);
  return (
    <section className="card grid grid-cols-3 gap-2 p-4">
      <SummaryCell label="Aktuell" value={formatValue(latest.value, 'kg')} />
      <SummaryCell label="7 Tage" value={w1 ? signedDelta(latest.value - w1.value, 'kg') : '–'} />
      <SummaryCell label="4 Wochen" value={w4 ? signedDelta(latest.value - w4.value, 'kg') : '–'} />
    </section>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
        {label}
      </span>
      <span className="stat-number text-lg">{value}</span>
    </div>
  );
}

function BodyFatCard({ athlete, metrics, grouped }: Shared) {
  const result = useMemo(() => bodyFatSeries(athlete, metrics, grouped), [athlete, metrics, grouped]);

  if (!result.ok) {
    return (
      <section className="card flex flex-col gap-1 p-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Körperfett (Navy)</h2>
        <p className="text-sm text-foreground-muted">
          {bodyFatHint(result) ?? 'Noch keine Werte.'}
        </p>
        <p className="text-xs text-foreground-subtle">
          {athlete?.sex === 'f'
            ? 'Benötigt: Größe, Hals, Taille (schmalste Stelle) und Hüfte.'
            : 'Benötigt: Größe, Hals und Bauch (auf Höhe Nabel).'}
        </p>
      </section>
    );
  }

  const { points } = result;
  const latest = points[points.length - 1];
  const prev = points[points.length - 2];
  // Für den TrendChart als Pseudo-Messreihe aufbereiten.
  const series: MeasurementRow[] = points.map((p) => ({
    id: `bf-${p.date}`,
    athlete_id: athlete?.id ?? '',
    metric_id: BODY_FAT_METRIC.id,
    value: Math.round(p.value * 10) / 10,
    reps: null,
    weight: null,
    side: null,
    tested_at: p.date,
    entered_by: 'athlete',
    note: null,
    created_at: p.date,
  }));

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Körperfett (Navy)</h2>
          <p className="text-xs text-foreground-subtle">
            Geschätzt aus Größe, Hals und {latest.trunkLabel}
            {athlete?.sex === 'f' ? ' und Hüfte' : ''} · Stand {formatDate(latest.date)}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="stat-number text-3xl leading-none">{formatValue(latest.value, '%')}</span>
          {prev && (
            <span className="mt-1 text-xs text-foreground-muted">
              {signedDelta(latest.value - prev.value, '%')}
            </span>
          )}
        </div>
      </div>
      {series.length > 1 && <TrendChart metric={BODY_FAT_METRIC} series={series} />}
    </section>
  );
}

function CircTile({
  metric,
  rows,
  selected,
  onClick,
}: {
  metric: MetricRow;
  rows: MeasurementRow[];
  selected: boolean;
  onClick: () => void;
}) {
  const limb = supportsSide(metric);
  const left = limb ? latestRow(rows.filter((r) => r.side === 'left')) : null;
  const right = limb ? latestRow(rows.filter((r) => r.side === 'right')) : null;
  const daily = limb ? [] : dailyLatest(rows);
  const latest = daily[daily.length - 1] ?? null;
  const prev = daily[daily.length - 2] ?? null;
  const stamp = latestRow(rows)?.tested_at;

  return (
    <TileButton selected={selected} onClick={onClick}>
      <span className="text-xs font-medium text-foreground-muted">{metric.label}</span>
      {limb ? (
        <span className="stat-number text-xl leading-tight">
          {left || right ? (
            <>
              <span className="text-xs font-normal text-foreground-subtle">L </span>
              {left ? formatValue(left.value, '') : '–'}
              <span className="ml-2 text-xs font-normal text-foreground-subtle">R </span>
              {right ? formatValue(right.value, '') : '–'}
            </>
          ) : (
            '–'
          )}
        </span>
      ) : (
        <span className="stat-number text-2xl leading-tight">
          {latest ? formatValue(latest.value, metric.unit) : '–'}
        </span>
      )}
      <span className="text-xs text-foreground-subtle">
        {prev && latest
          ? `${signedDelta(latest.value - prev.value, metric.unit)} · ${formatDate(latest.tested_at)}`
          : stamp
            ? formatDate(stamp)
            : 'Kein Wert'}
      </span>
    </TileButton>
  );
}

function HeartTile({
  metric,
  status,
  selected,
  onClick,
}: {
  metric: MetricRow;
  status: HeartStatus | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <TileButton selected={selected} onClick={onClick}>
      <span className="text-xs font-medium text-foreground-muted">{metric.label}</span>
      <span
        className={clsx(
          'stat-number text-3xl leading-none',
          status && SEVERITY_TEXT[status.severity],
        )}
      >
        {status ? formatValue(status.latest.value, metric.unit) : '–'}
      </span>
      <span className="text-xs text-foreground-subtle">
        {status ? formatDate(status.latest.tested_at) : 'Kein Wert'}
      </span>
      {status?.baseline != null && status.pctDiff != null && (
        <dl className="mt-auto flex flex-col gap-1 border-t border-line pt-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-foreground-subtle">Ø normal</dt>
            <dd className="stat-number font-semibold text-foreground">
              {formatValue(Math.round(status.baseline), metric.unit)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-foreground-subtle">Abweichung</dt>
            <dd className={clsx('stat-number font-semibold', SEVERITY_TEXT[status.severity])}>
              {formatPercentDelta(status.pctDiff)}
            </dd>
          </div>
        </dl>
      )}
    </TileButton>
  );
}

function TileButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'card flex flex-col gap-2 p-4 text-left transition',
        selected ? 'border-accent ring-1 ring-accent/40' : 'hover:border-foreground-subtle/40',
      )}
    >
      {children}
    </button>
  );
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-foreground-subtle"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}
