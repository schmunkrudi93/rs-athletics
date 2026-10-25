'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { clsx } from '@/lib/clsx';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { StatTile } from '@/components/stat-tile';
import { MeasurementDialog } from '@/components/measurement-dialog';
import { MeasurementEditDialog } from '@/components/measurement-edit-dialog';
import { Fireworks } from '@/components/fireworks';
import { GamesSpeedDeficit } from '@/components/games-speed-deficit';
import { GameSpeedPreview } from '@/components/game-speed-preview';
import { RsaTile } from '@/components/rsa-tile';
import { RsaDetail } from '@/components/rsa-detail';
import { getSupabaseClient } from '@/lib/supabase/client';
import { CATEGORY_ORDER, VISIBLE_CATEGORIES, type MetricCategory } from '@/lib/constants';
import { computeDeficits, isGamesSpeedMetric, isGamesSpeedReference } from '@/lib/games-speed';
import { isRsaMetric } from '@/lib/rsa';
import {
  computeStat,
  dailyBest,
  dayKey,
  filterByRange,
  groupByMetric,
  hasNote,
  RANGES,
  recentAverage,
  sortMetrics,
  type Range,
} from '@/lib/metrics';
import { ageLabel, formatDate, formatPercent, formatValue, initials } from '@/lib/format';
import { oneRepMaxBreakdown } from '@/lib/one-rep-max';
import {
  asymmetrySeverity,
  computeSideComparison,
  supportsSide,
  type SideComparison,
} from '@/lib/laterality';
import type { AthleteRow, MeasurementRow, MetricRow } from '@/lib/database.types';

const TrendChart = dynamic(() => import('@/components/trend-chart').then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-surface" />,
});

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  sprint: 'Sprint',
  jump: 'Sprung',
  strength: 'Kraft',
  cod: 'Richtungswechsel',
  endurance: 'Ausdauer',
  custom: 'Sonstige',
};

type AthleteDashboardProps = {
  athleteId: string;
  /** „+ Eintragen" + Eingabedialog zeigen (Athleten-Eigenansicht; später Coach-Testing). */
  enableEntry?: boolean;
  /** Wer trägt ein? Wirkt nur zusammen mit enableEntry. */
  enteredBy?: 'athlete' | 'coach';
  /** Einzelne Messwerte korrigieren/löschen erlauben (Stift je Roh-Wert). */
  enableEdit?: boolean;
  /** Optional einschränken, welche Werte bearbeitbar sind (z. B. Athlet nur eigene). */
  canEditMeasurement?: (m: MeasurementRow) => boolean;
  /** Optionaler Zurück-Link oben (z. B. „/coach"). */
  backHref?: string;
  /** Optionaler Bereich am Seitenende (z. B. Coach-Verwaltung: Archivieren/Entfernen).
   *  Als Funktion erhält er `reload`, um nach Änderungen den Kopf neu zu laden. */
  footer?: ReactNode | ((ctx: { reload: () => void }) => ReactNode);
};

/**
 * Das Athleten-Dashboard (Profilkopf, Reiter, Kacheln, Graph, Verlauf) – geteilt
 * zwischen der Eigenansicht des Athleten und der (lesenden) Coach-Detailansicht.
 * Die Daten werden je `athleteId` geladen; RLS entscheidet, wer was sehen darf.
 */
export function AthleteDashboard({
  athleteId,
  enableEntry = false,
  enteredBy = 'athlete',
  enableEdit = false,
  canEditMeasurement = () => true,
  backHref,
  footer,
}: AthleteDashboardProps) {
  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [category, setCategory] = useState<MetricCategory>(VISIBLE_CATEGORIES[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('3M');
  // Zeitfenster der oberen Kacheln (Bestwert je Metrik im Fenster). Eigener
  // Schalter, unabhängig vom Verlaufs-Graph unten. Default: Alle = All-Time-PB.
  const [tileRange, setTileRange] = useState<Range>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MeasurementRow | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  // „Seiten"-Umschaltung im Dashboard: Hauptansicht vs. Game-Speed-Detail
  // (eigene Seite via Client-State – reicht durch beide Render-Kontexte, ohne
  // Routen/Auth zu duplizieren). gsSelectedId = aktive Metrik im Detail.
  const [view, setView] = useState<'main' | 'gamespeed' | 'rsa'>('main');
  const [gsSelectedId, setGsSelectedId] = useState<string | null>(null);
  const [rsaMetricId, setRsaMetricId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!athleteId) return;
    const supabase = getSupabaseClient();
    const [aRes, mRes, msRes] = await Promise.all([
      supabase.from('athletes').select('*').eq('id', athleteId).single(),
      supabase.from('metrics').select('*'),
      supabase.from('measurements').select('*').eq('athlete_id', athleteId),
    ]);
    if (aRes.error) {
      setLoadError(aRes.error.message);
      setLoading(false);
      return;
    }
    setAthlete(aRes.data);
    // Archivierte Metriken (is_active=false) ausblenden. `!== false` ist
    // pre-migration-sicher: fehlt die Spalte noch, bleibt alles sichtbar.
    setMetrics((mRes.data ?? []).filter((m) => m.is_active !== false));
    setMeasurements(msRes.data ?? []);
    setLoadError(null);
    setLoading(false);
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId) return;
    setLoading(true);
    void load();
  }, [athleteId, load]);

  const grouped = useMemo(() => groupByMetric(measurements), [measurements]);
  // Pro (Metrik, Tag) nur der Tagesbestwert. Roh-Einträge bleiben in der DB –
  // dies ist reine Anzeige-Aggregation und gilt für Kacheln, Verlauf und Graph.
  const dailyByMetric = useMemo(() => {
    const map = new Map<string, MeasurementRow[]>();
    for (const m of metrics) map.set(m.id, dailyBest(grouped.get(m.id) ?? [], m.higher_is_better));
    return map;
  }, [metrics, grouped]);
  const categoryMetrics = useMemo(
    () => sortMetrics(metrics.filter((m) => m.category === category)),
    [metrics, category],
  );
  // Normale Kacheln: im cod-Reiter die Game-Speed-Gruppe (5-10-Familie) ausblenden
  // (eigene Preview/Detailseite) und RSA-Tests generell (eigene RSA-Kachel/Detail).
  // Die volle Liste (categoryMetrics) bleibt für den Eingabedialog erhalten.
  const tileMetrics = useMemo(
    () =>
      categoryMetrics.filter(
        (m) => !(category === 'cod' && isGamesSpeedMetric(m)) && !isRsaMetric(m),
      ),
    [category, categoryMetrics],
  );
  // RSA-Tests der aktuellen Kategorie (eigene Kachel + Detailansicht).
  const rsaMetrics = useMemo(() => categoryMetrics.filter(isRsaMetric), [categoryMetrics]);
  // Kachel-Kennzahlen je Metrik im gewählten Zeitfenster (Bestwert = PB im Fenster,
  // Ø = Schnitt im Fenster). Der gleitende 4-Wochen-Schnitt hängt nicht am Fenster.
  const stats = useMemo(
    () =>
      tileMetrics.map((m) => {
        const daily = dailyByMetric.get(m.id) ?? [];
        return computeStat(m, filterByRange(daily, tileRange), recentAverage(daily));
      }),
    [tileMetrics, dailyByMetric, tileRange],
  );
  // Games-Speed-/Richtungswechsel-Defizit (nur im cod-Reiter, wenn Referenz + Cut da sind).
  const deficitReport = useMemo(
    () => (category === 'cod' ? computeDeficits(categoryMetrics, dailyByMetric) : null),
    [category, categoryMetrics, dailyByMetric],
  );

  // Auswahl gültig halten: bei Kategoriewechsel auf erste (mit Daten) springen.
  useEffect(() => {
    const inCategory = tileMetrics.some((m) => m.id === selectedId);
    if (!inCategory) {
      const withData = tileMetrics.find((m) => (dailyByMetric.get(m.id)?.length ?? 0) > 0);
      setSelectedId((withData ?? tileMetrics[0])?.id ?? null);
    }
  }, [tileMetrics, dailyByMetric, selectedId]);

  const selectedMetric = tileMetrics.find((m) => m.id === selectedId) ?? null;

  // Game-Speed-Gruppe (5-10 Linear/90°/180°) für Preview + Detailansicht. Nur im
  // cod-Reiter befüllt – categoryMetrics ist dort die volle Richtungswechsel-Liste.
  const gameSpeedMetrics = useMemo(
    () => categoryMetrics.filter(isGamesSpeedMetric),
    [categoryMetrics],
  );
  // Im Detail aktiv gewählte Game-Speed-Metrik; Default = Linear-Referenz.
  const gsMetric =
    gameSpeedMetrics.find((m) => m.id === gsSelectedId) ??
    gameSpeedMetrics.find(isGamesSpeedReference) ??
    gameSpeedMetrics[0] ??
    null;
  // Für die RSA-Detailansicht aktiv gewählter RSA-Test.
  const rsaMetric = rsaMetrics.find((m) => m.id === rsaMetricId) ?? rsaMetrics[0] ?? null;

  // Reiter nur für Kategorien zeigen, die tatsächlich (aktive) Metriken haben –
  // so erscheinen Kraft/Richtungswechsel/Ausdauer/Sonstige erst, sobald dort
  // Tests existieren, und es bleiben keine leeren Reiter stehen.
  const presentCategories = useMemo<MetricCategory[]>(() => {
    const present = new Set(metrics.map((m) => m.category));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    return ordered.length > 0 ? ordered : VISIBLE_CATEGORIES;
  }, [metrics]);
  const categoryOptions = presentCategories.map((c) => ({ key: c, label: CATEGORY_LABELS[c] }));

  // Aktiven Reiter gültig halten, falls seine Kategorie wegfällt (z. B. alles archiviert).
  useEffect(() => {
    if (!presentCategories.includes(category)) setCategory(presentCategories[0]);
  }, [presentCategories, category]);

  // Detail-Ansichten verlassen, sobald ihr Reiter/ihre Metrik nicht mehr passt.
  useEffect(() => {
    if (view === 'gamespeed' && category !== 'cod') setView('main');
    if (view === 'rsa' && !rsaMetrics.some((m) => m.id === rsaMetricId)) setView('main');
  }, [view, category, rsaMetrics, rsaMetricId]);

  return (
    <>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5">
        {backHref && (
          <Link
            href={backHref}
            className="-mb-2 inline-flex w-fit items-center gap-1.5 text-sm text-foreground-muted transition hover:text-foreground"
          >
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
              <path d="M10 4l-4 4 4 4" />
            </svg>
            Athletenliste
          </Link>
        )}

        {/* Profil-Kopf */}
        <section className="card flex items-center gap-4 p-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong font-display text-xl font-bold text-white">
            {athlete ? initials(athlete.full_name) : '–'}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold text-foreground">
              {athlete?.full_name ?? 'Athlet'}
            </h1>
            <p className="truncate text-sm text-foreground-muted">
              {[athlete?.position, athlete?.sport, ageLabel(athlete?.birth_date)]
                .filter(Boolean)
                .join(' · ') || 'Profil'}
            </p>
          </div>
        </section>

        {loadError && (
          <div className="card border-danger/40 p-4 text-sm text-danger">
            Daten konnten nicht geladen werden: {loadError}
          </div>
        )}

        {view === 'gamespeed' ? (
          /* ---- Game-Speed-Detailansicht (eigene „Seite" via Client-State) ---- */
          <>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setView('main')}
                className="inline-flex w-fit items-center gap-1.5 text-sm text-foreground-muted transition hover:text-foreground"
              >
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
                  <path d="M10 4l-4 4 4 4" />
                </svg>
                Richtungswechsel
              </button>
              {enableEntry && (
                <Button
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                  disabled={loading || !athleteId}
                >
                  + Eintragen
                </Button>
              )}
            </div>

            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Game Speed</h1>
              <p className="mt-0.5 text-sm text-foreground-muted">
                Defizit der Cut-Varianten (90° / 180°) zum linearen 5-10 Sprint.
              </p>
            </div>

            {deficitReport ? (
              <GamesSpeedDeficit report={deficitReport} />
            ) : (
              <div className="card p-4">
                <p className="text-sm text-foreground-muted">
                  Noch keine Defizit-Auswertung. Trage „5-10 Linear“ als Referenz sowie mindestens
                  eine Cut-Variante (90° / 180°) ein.
                </p>
              </div>
            )}

            {gameSpeedMetrics.length > 0 && (
              <>
                <div className="no-scrollbar overflow-x-auto">
                  <Segmented
                    className="whitespace-nowrap"
                    options={gameSpeedMetrics.map((m) => ({
                      key: m.id,
                      label: shortGsLabel(m.label),
                    }))}
                    value={gsMetric?.id ?? ''}
                    onChange={(id) => setGsSelectedId(id)}
                  />
                </div>
                {gsMetric && (
                  <MetricDetailSection
                    metric={gsMetric}
                    rawRows={grouped.get(gsMetric.id) ?? []}
                    range={range}
                    onRangeChange={setRange}
                    enableEntry={enableEntry}
                    onAdd={() => setDialogOpen(true)}
                    enableEdit={enableEdit}
                    canEditRow={canEditMeasurement}
                    onEdit={setEditing}
                  />
                )}
              </>
            )}
          </>
        ) : view === 'rsa' ? (
          /* ---- RSA-Detailansicht (eigene „Seite" via Client-State) ---- */
          <>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setView('main')}
                className="inline-flex w-fit items-center gap-1.5 text-sm text-foreground-muted transition hover:text-foreground"
              >
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
                  <path d="M10 4l-4 4 4 4" />
                </svg>
                {CATEGORY_LABELS[category]}
              </button>
              {enableEntry && (
                <Button
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                  disabled={loading || !athleteId}
                >
                  + Eintragen
                </Button>
              )}
            </div>

            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">
                {rsaMetric?.label ?? 'RSA'}
              </h1>
              <p className="mt-0.5 text-sm text-foreground-muted">
                Wiederholte Sprints je Session · niedriger = besser.
              </p>
            </div>

            {rsaMetric && (
              <RsaDetail
                metric={rsaMetric}
                rawRows={grouped.get(rsaMetric.id) ?? []}
                enableEdit={enableEdit}
                canEditRow={canEditMeasurement}
                onEdit={setEditing}
                enableEntry={enableEntry}
                onAdd={() => setDialogOpen(true)}
              />
            )}
          </>
        ) : (
          /* ---- Hauptansicht: Reiter, Kacheln, (cod) Game-Speed-Preview, Verlauf ---- */
          <>
            {/* Reiter (eine Zeile, horizontal scrollbar) + Eintragen auf eigener Zeile */}
            <div className="flex flex-col gap-3">
              <div className="no-scrollbar overflow-x-auto">
                <Segmented
                  className="whitespace-nowrap"
                  options={categoryOptions}
                  value={category}
                  onChange={setCategory}
                />
              </div>
              {enableEntry && (
                <Button
                  onClick={() => setDialogOpen(true)}
                  disabled={loading || !athleteId}
                  className="w-full sm:w-auto sm:self-end"
                >
                  + Eintragen
                </Button>
              )}
            </div>

            {loading ? (
              <SkeletonTiles />
            ) : (
              <>
                {/* Zeitfenster-Schalter für die Bestwert-Kacheln (wie beim Graphen). */}
                {stats.length > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
                      Bestwerte
                    </span>
                    <Segmented
                      size="sm"
                      options={RANGES.map((r) => ({ key: r.key, label: r.label }))}
                      value={tileRange}
                      onChange={setTileRange}
                    />
                  </div>
                )}

                {/* Kacheln (normale Tests + RSA-Kacheln mit Fatigue %) */}
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {stats.map((s) => (
                    <StatTile
                      key={s.metric.id}
                      stat={s}
                      selected={s.metric.id === selectedId}
                      onClick={() => setSelectedId(s.metric.id)}
                    />
                  ))}
                  {rsaMetrics.map((m) => (
                    <RsaTile
                      key={m.id}
                      metric={m}
                      rows={grouped.get(m.id) ?? []}
                      onClick={() => {
                        setRsaMetricId(m.id);
                        setView('rsa');
                      }}
                    />
                  ))}
                </section>

                {/* Game-Speed-Preview (nur Richtungswechsel) -> öffnet Detailansicht.
                    Immer sichtbar, sobald die Gruppe existiert – auch ohne Werte. */}
                {category === 'cod' && gameSpeedMetrics.length > 0 && (
                  <GameSpeedPreview report={deficitReport} onOpen={() => setView('gamespeed')} />
                )}

                {/* Verlauf + Historie der gewählten Kachel-Metrik */}
                {selectedMetric && (
                  <MetricDetailSection
                    metric={selectedMetric}
                    rawRows={grouped.get(selectedMetric.id) ?? []}
                    range={range}
                    onRangeChange={setRange}
                    enableEntry={enableEntry}
                    onAdd={() => setDialogOpen(true)}
                    enableEdit={enableEdit}
                    canEditRow={canEditMeasurement}
                    onEdit={setEditing}
                  />
                )}
              </>
            )}
          </>
        )}

        {view === 'main' && (typeof footer === 'function' ? footer({ reload: load }) : footer)}
      </main>

      {enableEntry && athleteId && (
        <MeasurementDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          athleteId={athleteId}
          metrics={categoryMetrics}
          defaultMetricId={
            view === 'gamespeed'
              ? gsMetric?.id ?? null
              : view === 'rsa'
                ? rsaMetric?.id ?? null
                : selectedId
          }
          enteredBy={enteredBy}
          onSaved={load}
          onPersonalBest={(detail) => setCelebration(detail)}
        />
      )}

      {enableEdit && (
        <MeasurementEditDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          measurement={editing}
          metric={(editing && metrics.find((m) => m.id === editing.metric_id)) || null}
          onSaved={load}
          onDeleted={load}
        />
      )}

      {celebration !== null && (
        <Fireworks detail={celebration} onDone={() => setCelebration(null)} />
      )}
    </>
  );
}

/** „5-10 90°" -> „90°": kompakte Reiter-Beschriftung im Game-Speed-Detail. */
function shortGsLabel(label: string): string {
  return label.replace(/^5-10\s*/, '') || label;
}

/** Verlauf (Graph) + Historie EINER Metrik. Bekommt die Roh-Werte und aggregiert
 *  selbst zu Tagesbestwerten – dadurch sowohl für die Kachel-Auswahl als auch für
 *  die Game-Speed-Detailansicht wiederverwendbar. */
function MetricDetailSection({
  metric,
  rawRows,
  range,
  onRangeChange,
  enableEntry = false,
  onAdd,
  enableEdit = false,
  canEditRow = () => true,
  onEdit,
}: {
  metric: MetricRow;
  rawRows: MeasurementRow[];
  range: Range;
  onRangeChange: (r: Range) => void;
  enableEntry?: boolean;
  onAdd?: () => void;
  enableEdit?: boolean;
  canEditRow?: (m: MeasurementRow) => boolean;
  onEdit?: (m: MeasurementRow) => void;
}) {
  const seriesAll = useMemo(
    () => dailyBest(rawRows, metric.higher_is_better),
    [rawRows, metric.higher_is_better],
  );
  const series = useMemo(() => filterByRange(seriesAll, range), [seriesAll, range]);
  const historyDesc = useMemo(() => [...seriesAll].reverse(), [seriesAll]);
  // Links/Rechts-Vergleich aus den Roh-Werten (nur Richtungswechsel-Tests mit Seite).
  const sideComparison = useMemo(
    () => (supportsSide(metric) ? computeSideComparison(rawRows, metric.higher_is_better) : null),
    [metric, rawRows],
  );
  // Roh-Versuche je Kalendertag (chronologisch) – fürs Aufklappen einer Tageszeile.
  const rawByDay = useMemo(() => {
    const map = new Map<string, MeasurementRow[]>();
    for (const row of rawRows) {
      const key = dayKey(row.tested_at);
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return map;
  }, [rawRows]);

  return (
    <section className="card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">{metric.label}</h2>
          <p className="text-xs text-foreground-subtle">
            {metric.higher_is_better ? 'Höher ist besser' : 'Niedriger ist besser'}
            {metric.unit ? ` · ${metric.unit}` : ''}
          </p>
        </div>
        <Segmented
          size="sm"
          options={RANGES.map((r) => ({ key: r.key, label: r.label }))}
          value={range}
          onChange={onRangeChange}
        />
      </div>

      {sideComparison && (sideComparison.left || sideComparison.right) && (
        <SideComparisonBlock comparison={sideComparison} unit={metric.unit} />
      )}

      {seriesAll.length === 0 ? (
        <EmptyMetric onAdd={enableEntry ? onAdd : undefined} />
      ) : series.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-muted">
          Keine Werte in diesem Zeitraum.
        </p>
      ) : (
        <TrendChart metric={metric} series={series} />
      )}

      {historyDesc.length > 0 && (
        <div className="flex flex-col">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            Historie
          </h3>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {historyDesc.map((m) => (
              <HistoryRow
                key={m.id}
                m={m}
                unit={metric.unit}
                dayRows={rawByDay.get(dayKey(m.tested_at)) ?? [m]}
                canEdit={enableEdit}
                canEditRow={canEditRow}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Links/Rechts-Bestwerte einer Metrik + relative Differenz. Ampel auf der
 *  Differenz: > 10 % rot, > 5 % gelb, sonst neutral. Steht im Detail direkt
 *  unter dem Metrik-Kopf (also „unter der Bestzeit"). */
function SideComparisonBlock({
  comparison,
  unit,
}: {
  comparison: SideComparison;
  unit: string;
}) {
  const { left, right, pctDiff } = comparison;
  const severity = asymmetrySeverity(pctDiff);
  const diffColor =
    severity === 'high'
      ? 'text-danger'
      : severity === 'warn'
        ? 'text-warning'
        : 'text-foreground';
  return (
    <div className="flex items-end justify-between gap-3 rounded-xl border border-line bg-surface-muted/40 px-3 py-2.5">
      <div className="flex gap-5">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
            Links
          </span>
          <span className="stat-number text-lg">{left ? formatValue(left.value, unit) : '–'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
            Rechts
          </span>
          <span className="stat-number text-lg">
            {right ? formatValue(right.value, unit) : '–'}
          </span>
        </div>
      </div>
      {pctDiff != null && (
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
            Differenz
          </span>
          <span className={clsx('stat-number text-lg font-semibold', diffColor)}>
            {formatPercent(pctDiff)}
          </span>
        </div>
      )}
    </div>
  );
}

function EnteredByBadge({ by }: { by: string }) {
  const isCoach = by === 'coach';
  return (
    <span
      className={clsx(
        'rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        isCoach ? 'bg-accent-soft text-accent' : 'bg-surface-muted text-foreground-subtle',
      )}
    >
      {isCoach ? 'Coach' : 'Selbst'}
    </span>
  );
}

/** Eine Historie-Zeile (= ein Tag).
 *  Mehrere Versuche am Tag: ganze Zeile aufklappbar -> alle Roh-Werte (chronologisch,
 *  wie eingegeben), Tagesbestwert markiert. Einzelner Wert: Notiz per Symbol
 *  auf-/zuklappen (touch-tauglich, wie bisher). */
/** Wert mit optionaler 1RM-Herleitung „3 × 50 kg" darunter (rechtsbündig).
 *  Bei 1 Wdh. oder fehlenden reps/weight steht nur der Wert. */
function ValueWithBreakdown({
  value,
  reps,
  weight,
  unit,
  className,
}: {
  value: number;
  reps: number | null;
  weight: number | null;
  unit: string;
  className?: string;
}) {
  const breakdown = oneRepMaxBreakdown(reps, weight, unit);
  return (
    <span className="flex flex-col items-end">
      <span className={className}>{formatValue(value, unit)}</span>
      {breakdown && <span className="text-[11px] text-foreground-subtle">{breakdown}</span>}
    </span>
  );
}

function HistoryRow({
  m,
  unit,
  dayRows,
  canEdit = false,
  canEditRow = () => true,
  onEdit,
}: {
  m: MeasurementRow;
  unit: string;
  dayRows: MeasurementRow[];
  canEdit?: boolean;
  canEditRow?: (row: MeasurementRow) => boolean;
  onEdit?: (row: MeasurementRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const note = hasNote(m.note) ? m.note.trim() : null;
  const multiple = dayRows.length > 1;

  // Mehrere Versuche am selben Tag: ganze Zeile aufklappbar.
  if (multiple) {
    const anyNote = dayRows.some((r) => hasNote(r.note));
    return (
      <li className="py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={
            open
              ? `${formatDate(m.tested_at)}: Versuche ausblenden`
              : `${formatDate(m.tested_at)}: ${dayRows.length} Versuche anzeigen`
          }
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Chevron open={open} className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
            <span className="text-sm text-foreground-muted">{formatDate(m.tested_at)}</span>
            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground-subtle">
              {dayRows.length} Versuche
            </span>
            {anyNote && <NoteIcon className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />}
          </span>
          <ValueWithBreakdown
            value={m.value}
            reps={m.reps}
            weight={m.weight}
            unit={unit}
            className="stat-number text-base"
          />
        </button>

        {open && (
          <ul className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-3">
            {dayRows.map((r) => {
              const rNote = hasNote(r.note) ? r.note.trim() : null;
              const isBest = r.id === m.id;
              return (
                <li key={r.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <EnteredByBadge by={r.entered_by} />
                      {isBest && (
                        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          Bestwert
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      {canEdit && onEdit && canEditRow(r) && (
                        <EditButton onClick={() => onEdit(r)} />
                      )}
                      <ValueWithBreakdown
                        value={r.value}
                        reps={r.reps}
                        weight={r.weight}
                        unit={unit}
                        className={clsx(
                          'stat-number text-sm',
                          isBest ? 'font-semibold text-accent' : 'text-foreground-muted',
                        )}
                      />
                    </span>
                  </div>
                  {rNote && (
                    <p className="rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs text-foreground-muted">
                      {rNote}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  }

  // Einzelner Wert am Tag: Datum + Wert in einer Zeile, „Selbst/Coach" darunter –
  // so steht das Badge immer links bündig, unabhängig von der Datumsbreite.
  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-foreground-muted">{formatDate(m.tested_at)}</span>
        <span className="stat-number text-base">{formatValue(m.value, unit)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <EnteredByBadge by={m.entered_by} />
          {note && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Notiz ausblenden' : 'Notiz anzeigen'}
              className={clsx(
                'grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors',
                open
                  ? 'bg-accent-soft text-accent'
                  : 'text-foreground-subtle hover:text-foreground-muted',
              )}
            >
              <NoteIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
        {canEdit && onEdit && canEditRow(m) && <EditButton onClick={() => onEdit(m)} />}
      </div>
      {note && open && (
        <p className="mt-1.5 rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground-muted">
          {note}
        </p>
      )}
    </li>
  );
}

/** Aufklapp-Pfeil (zeigt nach rechts; um 90° gedreht = offen). */
function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={clsx('transition-transform duration-150', open && 'rotate-90', className)}
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

/** Kleines Notiz-Symbol (Dokument mit umgeknickter Ecke). */
function NoteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.5 9.5 9.5 12.5H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1z" />
      <path d="M9.5 12.5V10a.5.5 0 0 1 .5-.5h2.5" />
      <path d="M5.5 5.5h5M5.5 8h3" />
    </svg>
  );
}

/** Stift-Knopf zum Korrigieren/Löschen eines einzelnen Messwerts. */
function EditButton({ onClick }: { onClick: () => void }) {
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

function EmptyMetric({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-foreground-muted">Noch keine Werte für diese Metrik.</p>
      {onAdd && (
        <Button size="sm" variant="outline" onClick={onAdd}>
          Ersten Wert eintragen
        </Button>
      )}
    </div>
  );
}

function SkeletonTiles() {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card h-28 animate-pulse bg-surface" />
      ))}
    </section>
  );
}
