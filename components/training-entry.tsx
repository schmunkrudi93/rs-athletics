'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { LoadingScreen } from '@/components/loading-screen';
import { NumericKeypad } from '@/components/numeric-keypad';
import { Fireworks } from '@/components/fireworks';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { useRequireRole } from '@/lib/hooks/use-require-role';
import { getSupabaseClient } from '@/lib/supabase/client';
import { isBetter, sortMetrics } from '@/lib/metrics';
import { supportsSide, SIDE_LABELS, type Side } from '@/lib/laterality';
import { formatDelta, formatValue, initials, todayISO } from '@/lib/format';
import { clsx } from '@/lib/clsx';
import type { AthleteRow, MetricRow } from '@/lib/database.types';

/**
 * Trainingsmodus (iPad im Stativ): Coach wählt die Teilnehmer, danach trägt
 * jeder nach seinem Lauf/Sprung selbst ein: Name → Übung → Zahl → Speichern.
 * Keine feste Reihenfolge. Gespeichert wird als entered_by='coach' mit
 * heutigem Datum – die Werte landen direkt im jeweiligen Athletenprofil.
 */

/** Nur diese Reiter sind im Training relevant (Kraft, Ausdauer etc. bleiben weg). */
const TRAINING_CATEGORIES = [
  { key: 'sprint', label: 'Sprint' },
  { key: 'jump', label: 'Sprung' },
  { key: 'cod', label: 'Richtungswechsel' },
] as const;
type TrainingCategory = (typeof TRAINING_CATEGORIES)[number]['key'];

/** Max. Zeichen im Wertefeld (z. B. „245,5" oder „1,82"). */
const MAX_INPUT_LEN = 6;

/** Teilnehmerauswahl pro Tag merken – ein Neuladen des iPads verliert sie nicht. */
function storageKey(): string {
  return `rs-training-participants-${todayISO()}`;
}

function loadStoredParticipants(): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey());
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

function storeParticipants(ids: string[]) {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(ids));
  } catch {
    // Privater Modus o. Ä. – dann eben ohne Merken.
  }
}

/** Dauer als m:ss, z. B. „1:05". */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Heutiger Roh-Eintrag (für „Heute bisher" in der Namensliste). */
type TodayRow = { id: string; athlete_id: string; metric_id: string; value: number };

/** Eintrag im Protokoll dieser Sitzung (neueste zuerst). */
type LogEntry = {
  id: string;
  athleteId: string;
  athleteName: string;
  metric: MetricRow;
  value: number;
  side: Side | null;
  /** Fortschritt bei neuer Bestleistung, z. B. „−0,06 s"; sonst null. */
  pbDetail: string | null;
};

export function TrainingEntry() {
  const guard = useRequireRole('coach');

  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phase, setPhase] = useState<'select' | 'entry'>('select');
  const [participants, setParticipants] = useState<string[]>([]);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    const keys = TRAINING_CATEGORIES.map((c) => c.key);
    const [athRes, metRes, todayRes] = await Promise.all([
      supabase.from('athletes').select('*').eq('is_active', true).order('full_name'),
      supabase.from('metrics').select('*').in('category', keys).eq('is_active', true),
      supabase
        .from('measurements')
        .select('id, athlete_id, metric_id, value')
        .eq('tested_at', todayISO()),
    ]);
    const err = athRes.error ?? metRes.error ?? todayRes.error;
    if (err) {
      setLoadError(err.message);
      setLoading(false);
      return;
    }
    const list = athRes.data ?? [];
    setAthletes(list);
    // RSA-Tests gehören nicht in die Schnelleingabe (eigene Session-Logik).
    setMetrics(sortMetrics((metRes.data ?? []).filter((m) => !m.key.startsWith('rsa_'))));
    setTodayRows(todayRes.data ?? []);

    // Gemerkte Auswahl von heute übernehmen → direkt weiter eintragen.
    const valid = new Set(list.map((a) => a.id));
    const stored = loadStoredParticipants()?.filter((id) => valid.has(id)) ?? [];
    if (stored.length > 0) {
      setParticipants(stored);
      setPhase('entry');
    }
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (guard.status !== 'authorized') return;
    void load();
  }, [guard.status, load]);

  if (guard.status !== 'authorized') return <LoadingScreen />;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar>
        <Link
          href="/coach"
          className="inline-flex h-9 select-none items-center justify-center rounded-xl border border-line bg-surface px-3 text-sm font-medium text-foreground transition hover:border-accent/50 active:scale-[0.98]"
        >
          Beenden
        </Link>
      </TopBar>

      {loadError ? (
        <div className="card m-4 border-danger/40 p-4 text-sm text-danger">
          Daten konnten nicht geladen werden: {loadError}
        </div>
      ) : loading ? (
        <p className="p-6 text-center text-sm text-foreground-muted">lädt …</p>
      ) : phase === 'select' ? (
        <ParticipantSelect
          athletes={athletes}
          initial={participants}
          onStart={(ids) => {
            setParticipants(ids);
            storeParticipants(ids);
            setPhase('entry');
          }}
        />
      ) : (
        <EntryScreen
          athletes={athletes.filter((a) => participants.includes(a.id))}
          metrics={metrics}
          todayRows={todayRows}
          setTodayRows={setTodayRows}
          onEditParticipants={() => setPhase('select')}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schritt 1: Wer ist heute dabei?
// ---------------------------------------------------------------------------

function ParticipantSelect({
  athletes,
  initial,
  onStart,
}: {
  athletes: AthleteRow[];
  initial: string[];
  onStart: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = athletes.length > 0 && selected.size === athletes.length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Wer ist heute dabei?</h1>
          <p className="text-sm text-foreground-muted">
            Antippen zum Auswählen · {selected.size} ausgewählt
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSelected(allSelected ? new Set() : new Set(athletes.map((a) => a.id)))}
        >
          {allSelected ? 'Keine' : 'Alle'}
        </Button>
      </div>

      {athletes.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-foreground-muted">
          Keine aktiven Athleten.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {athletes.map((a) => {
            const on = selected.has(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  aria-pressed={on}
                  className={clsx(
                    'card flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.98]',
                    on ? 'border-accent bg-accent-soft' : 'hover:border-accent/50',
                  )}
                >
                  <Avatar name={a.full_name} active={on} />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {a.full_name}
                  </span>
                  {on && <span className="text-lg font-bold text-accent">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 py-3 pb-safe backdrop-blur">
        <Button
          size="lg"
          className="w-full"
          disabled={selected.size === 0}
          // Reihenfolge = alphabetisch (wie die Liste) – leichter zu finden.
          onClick={() => onStart(athletes.filter((a) => selected.has(a.id)).map((a) => a.id))}
        >
          Training starten ({selected.size})
        </Button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Schritt 2: Schnelleingabe
// ---------------------------------------------------------------------------

function EntryScreen({
  athletes,
  metrics,
  todayRows,
  setTodayRows,
  onEditParticipants,
}: {
  athletes: AthleteRow[];
  metrics: MetricRow[];
  todayRows: TodayRow[];
  setTodayRows: React.Dispatch<React.SetStateAction<TodayRow[]>>;
  onEditParticipants: () => void;
}) {
  // Nur Reiter anzeigen, die (aktive) Metriken haben.
  const categories = TRAINING_CATEGORIES.filter((c) => metrics.some((m) => m.category === c.key));

  // Nur eine Person dabei? Dann ist sie fest ausgewählt – kein Antippen nötig.
  const single = athletes.length === 1;
  const [athleteId, setAthleteId] = useState<string | null>(single ? athletes[0].id : null);
  const [category, setCategory] = useState<TrainingCategory>(categories[0]?.key ?? 'sprint');
  const [metricId, setMetricId] = useState<string | null>(null);
  const [valueStr, setValueStr] = useState('');
  const [side, setSide] = useState<'' | Side>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  // Feuerwerk bei Bestleistung; `id` erzwingt ein frisches Overlay pro PB.
  const [celebration, setCelebration] = useState<{ id: string; detail: string } | null>(null);
  // Alle bisherigen Werte der Teilnehmer (nur Trainings-Übungen) – Basis der PB-Anzeige.
  const [historyRows, setHistoryRows] = useState<TodayRow[]>([]);
  // Pausen-Uhr: Zeitpunkt des letzten Speicherns je Athlet (zählt hoch).
  const [lastSavedAt, setLastSavedAt] = useState<Map<string, number>>(() => new Map());
  const [now, setNow] = useState(() => Date.now());

  const athlete = athletes.find((a) => a.id === athleteId) ?? null;
  const metric = metrics.find((m) => m.id === metricId) ?? null;
  const categoryMetrics = metrics.filter((m) => m.category === category);
  const hasSide = supportsSide(metric);

  // Historie einmalig laden (seitenweise – Supabase liefert max. 1000 Zeilen pro Abfrage).
  const athleteIdsKey = athletes.map((a) => a.id).join(',');
  useEffect(() => {
    const ids = athleteIdsKey.split(',').filter(Boolean);
    const metricIds = metrics.map((m) => m.id);
    if (ids.length === 0 || metricIds.length === 0) return;
    let active = true;
    void (async () => {
      const supabase = getSupabaseClient();
      const rows: TodayRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error: histErr } = await supabase
          .from('measurements')
          .select('id, athlete_id, metric_id, value')
          .in('athlete_id', ids)
          .in('metric_id', metricIds)
          .order('id')
          .range(from, from + PAGE - 1);
        if (histErr || !data) break;
        rows.push(...data);
        if (data.length < PAGE) break;
      }
      if (!active) return;
      // Bereits während des Ladens gespeicherte Einträge nicht verlieren.
      const loaded = new Set(rows.map((r) => r.id));
      setHistoryRows((prev) => [...rows, ...prev.filter((r) => !loaded.has(r.id))]);
    })();
    return () => {
      active = false;
    };
  }, [athleteIdsKey, metrics]);

  /** All-Time-Bestwert je Athlet+Übung, Schlüssel `${athleteId}:${metricId}`. */
  const bestByKey = useMemo(() => {
    const map = new Map<string, number>();
    const hib = new Map(metrics.map((m) => [m.id, m.higher_is_better]));
    for (const r of historyRows) {
      const key = `${r.athlete_id}:${r.metric_id}`;
      const cur = map.get(key);
      if (cur === undefined || isBetter(r.value, cur, hib.get(r.metric_id) ?? false)) {
        map.set(key, r.value);
      }
    }
    return map;
  }, [historyRows, metrics]);

  // Uhr nur ticken lassen, solange mindestens eine Pausen-Uhr läuft.
  const timersRunning = lastSavedAt.size > 0;
  useEffect(() => {
    if (!timersRunning) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [timersRunning]);

  function pauseFor(id: string): string | null {
    const since = lastSavedAt.get(id);
    return since === undefined ? null : formatDuration(now - since);
  }

  function stopTimer(id: string) {
    setLastSavedAt((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  /** Heutiger Bestwert je Athlet für die gewählte Übung (für die Namensliste). */
  const todayBestByAthlete = useMemo(() => {
    const map = new Map<string, number>();
    if (!metric) return map;
    for (const r of todayRows) {
      if (r.metric_id !== metric.id) continue;
      const cur = map.get(r.athlete_id);
      if (cur === undefined || isBetter(r.value, cur, metric.higher_is_better)) {
        map.set(r.athlete_id, r.value);
      }
    }
    return map;
  }, [todayRows, metric]);

  // --- Zahleneingabe ------------------------------------------------------
  const appendDigit = useCallback((d: string) => {
    setError(null);
    setValueStr((v) => {
      if (v.length >= MAX_INPUT_LEN) return v;
      const [, decimals] = v.split(',');
      if (decimals !== undefined && decimals.length >= 2) return v; // max. 2 Nachkommastellen
      if (v === '0') return d; // führende Null ersetzen
      return v + d;
    });
  }, []);

  const appendDecimal = useCallback(() => {
    setValueStr((v) => (v.includes(',') ? v : (v || '0') + ','));
  }, []);

  const deleteLast = useCallback(() => setValueStr((v) => v.slice(0, -1)), []);

  const value = Number(valueStr.replace(',', '.'));
  const canSave =
    !!athlete && !!metric && valueStr.trim() !== '' && Number.isFinite(value) && value > 0;

  // --- Speichern ----------------------------------------------------------
  const save = useCallback(async () => {
    if (!athlete || !metric || saving) return;
    if (!valueStr.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Bitte einen gültigen Wert eingeben.');
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = getSupabaseClient();

    // All-Time-Bestwert VOR dem Speichern – Basis der PB-Erkennung (wie im
    // normalen Eintrags-Dialog: erster Wert einer Metrik zählt nicht als PB).
    const { data: priorRows } = await supabase
      .from('measurements')
      .select('value')
      .eq('athlete_id', athlete.id)
      .eq('metric_id', metric.id);
    let priorBest: number | null = null;
    for (const r of priorRows ?? []) {
      if (priorBest === null || isBetter(r.value, priorBest, metric.higher_is_better)) {
        priorBest = r.value;
      }
    }

    const sideValue = hasSide && side ? side : null;
    const { data: inserted, error: insErr } = await supabase
      .from('measurements')
      .insert({
        athlete_id: athlete.id,
        metric_id: metric.id,
        value,
        ...(sideValue ? { side: sideValue } : {}),
        tested_at: todayISO(),
        entered_by: 'coach',
      })
      .select('id')
      .single();

    setSaving(false);
    if (insErr || !inserted) {
      setError(`Speichern fehlgeschlagen: ${insErr?.message ?? 'unbekannter Fehler'}`);
      return;
    }

    const isPB = priorBest !== null && isBetter(value, priorBest, metric.higher_is_better);
    const pbDetail =
      isPB && priorBest !== null ? formatDelta(value - priorBest, metric.unit) : null;
    setLog((prev) => [
      {
        id: inserted.id,
        athleteId: athlete.id,
        athleteName: athlete.full_name,
        metric,
        value,
        side: sideValue,
        pbDetail,
      },
      ...prev,
    ]);
    if (pbDetail) {
      const verb = metric.higher_is_better ? 'besser' : 'schneller';
      setCelebration({
        id: inserted.id,
        detail: `${athlete.full_name} · ${metric.label}: ${pbDetail} ${verb}`,
      });
    }
    const row = { id: inserted.id, athlete_id: athlete.id, metric_id: metric.id, value };
    setTodayRows((prev) => [...prev, row]);
    setHistoryRows((prev) => [...prev, row]);
    // Pausen-Uhr für diesen Athleten (neu) starten.
    const savedAt = Date.now();
    setNow(savedAt);
    setLastSavedAt((prev) => new Map(prev).set(athlete.id, savedAt));

    // Übung bleibt gewählt (nächster läuft meist dasselbe). Bei mehreren
    // Teilnehmern wird der Name bewusst zurückgesetzt, damit niemand
    // versehentlich beim Vorgänger einträgt; ist nur eine Person dabei, bleibt sie.
    setValueStr('');
    setSide('');
    if (!single) setAthleteId(null);
  }, [athlete, metric, saving, valueStr, value, hasSide, side, setTodayRows, single]);

  /** Tippfehler rückgängig machen: Eintrag wieder löschen. */
  async function undo(entry: LogEntry) {
    const supabase = getSupabaseClient();
    const { error: delErr } = await supabase.from('measurements').delete().eq('id', entry.id);
    if (delErr) {
      setError(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }
    setLog((prev) => prev.filter((e) => e.id !== entry.id));
    setTodayRows((prev) => prev.filter((r) => r.id !== entry.id));
    setHistoryRows((prev) => prev.filter((r) => r.id !== entry.id));
  }

  // Protokoll: mit gewähltem Athleten nur seine Einträge, sonst alle.
  const visibleLog = (athlete ? log.filter((e) => e.athleteId === athlete.id) : log).slice(0, 8);
  const athletePause = athlete ? pauseFor(athlete.id) : null;
  const currentBest = athlete && metric ? bestByKey.get(`${athlete.id}:${metric.id}`) : undefined;
  const currentToday = athlete ? todayBestByAthlete.get(athlete.id) : undefined;

  // Hardware-Tastatur (z. B. am iPad-Keyboard) zusätzlich unterstützen.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key)) appendDigit(e.key);
      else if (e.key === ',' || e.key === '.') appendDecimal();
      else if (e.key === 'Backspace') deleteLast();
      else if (e.key === 'Enter') void save();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appendDigit, appendDecimal, deleteLast, save]);

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 md:grid-cols-[15rem_1fr]">
      {/* --- Links: Teilnehmer --- */}
      <aside className="flex flex-col gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          1 · Name
        </h2>
        <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {athletes.map((a) => {
            const on = a.id === athleteId;
            const today = todayBestByAthlete.get(a.id);
            const pb = metric ? bestByKey.get(`${a.id}:${metric.id}`) : undefined;
            const pause = pauseFor(a.id);
            return (
              <li key={a.id} className="shrink-0">
                <button
                  type="button"
                  // Bewusst kein Umschalten: ein zweiter Tipp (z. B. versehentlicher
                  // Doppeltipp am iPad) darf die Auswahl nicht wieder aufheben.
                  onClick={() => {
                    setAthleteId(a.id);
                    setError(null);
                  }}
                  aria-pressed={on}
                  className={clsx(
                    'card flex w-full items-center gap-3 px-3 py-2.5 text-left transition active:scale-[0.98]',
                    on
                      ? 'border-accent bg-accent/25 ring-2 ring-accent'
                      : 'hover:border-accent/50',
                  )}
                >
                  <Avatar name={a.full_name} active={on} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {a.full_name}
                    </span>
                    {metric && (pb !== undefined || today !== undefined) && (
                      <span className="block truncate text-xs text-foreground-muted">
                        {[
                          pb !== undefined && `PB ${formatValue(pb, metric.unit)}`,
                          today !== undefined && `Heute ${formatValue(today, metric.unit)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </span>
                  {pause && (
                    <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-foreground-muted">
                      {pause}
                    </span>
                  )}
                  {on && <span className="text-lg font-bold text-accent">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <Button variant="ghost" size="sm" onClick={onEditParticipants} className="self-start">
          Teilnehmer ändern
        </Button>
      </aside>

      {/* --- Rechts: Übung + Wert --- */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            2 · Übung
          </h2>
          {categories.length > 1 && (
            <Segmented
              options={categories.map((c) => ({ key: c.key, label: c.label }))}
              value={category}
              onChange={setCategory}
              className="self-start"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {categoryMetrics.map((m) => {
              const on = m.id === metricId;
              // PB des gewählten Athleten direkt am Übungs-Button.
              const pb = athlete ? bestByKey.get(`${athlete.id}:${m.id}`) : undefined;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMetricId(m.id);
                    setSide('');
                    setError(null);
                  }}
                  aria-pressed={on}
                  className={clsx(
                    'flex h-14 min-w-[5.5rem] flex-col items-center justify-center rounded-xl border px-4 font-medium leading-tight transition active:scale-[0.98]',
                    on
                      ? 'border-accent bg-accent text-white'
                      : 'border-line bg-surface text-foreground hover:border-accent/50',
                  )}
                >
                  <span>{m.label}</span>
                  {athlete && (
                    <span
                      className={clsx(
                        'text-[11px] font-normal tabular-nums',
                        on ? 'text-white/80' : 'text-foreground-muted',
                      )}
                    >
                      {pb !== undefined ? `PB ${formatValue(pb, m.unit)}` : 'noch kein Wert'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          {/* Anzeige + Protokoll */}
          <div className="flex min-w-0 flex-col gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              3 · Wert
            </h2>
            {athletePause && athlete && (
              <button
                type="button"
                onClick={() => stopTimer(athlete.id)}
                aria-label="Pausen-Uhr stoppen"
                className="card flex items-center justify-between gap-3 px-4 py-3 text-left transition active:scale-[0.99]"
              >
                <span className="text-sm text-foreground-muted">
                  Pause seit dem letzten Eintrag
                  <span className="block text-xs text-foreground-subtle">Antippen zum Stoppen</span>
                </span>
                <span className="font-display text-4xl font-bold tabular-nums text-accent">
                  {athletePause}
                </span>
              </button>
            )}
            <div className="card flex flex-col items-center gap-1 px-4 py-5 text-center">
              <p className="text-sm text-foreground-muted">
                <span className={athlete ? 'text-foreground' : 'text-warning'}>
                  {athlete?.full_name ?? 'Name wählen'}
                </span>
                {' · '}
                <span className={metric ? 'text-foreground' : 'text-warning'}>
                  {metric?.label ?? 'Übung wählen'}
                </span>
              </p>
              <p className="font-display text-5xl font-bold tabular-nums text-foreground">
                {valueStr || <span className="text-foreground-subtle">–</span>}
                {metric?.unit && (
                  <span className="ml-2 text-2xl font-semibold text-foreground-muted">
                    {metric.unit}
                  </span>
                )}
              </p>
              {metric && athlete && (
                <p className="text-sm text-foreground-muted">
                  Bestleistung{' '}
                  <span className="font-semibold text-foreground">
                    {currentBest !== undefined ? formatValue(currentBest, metric.unit) : '–'}
                  </span>
                  {currentToday !== undefined && (
                    <>
                      {' · '}Heute{' '}
                      <span className="font-semibold text-foreground">
                        {formatValue(currentToday, metric.unit)}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            {hasSide && (
              <Segmented
                options={[
                  { key: 'left', label: SIDE_LABELS.left },
                  { key: 'right', label: SIDE_LABELS.right },
                  { key: '', label: 'ohne' },
                ]}
                value={side}
                onChange={setSide}
                className="self-center"
              />
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            {visibleLog.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                <li className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  {athlete ? `Einträge · ${athlete.full_name}` : 'Letzte Einträge'}
                </li>
                {visibleLog.map((e) => (
                  <li
                    key={e.id}
                    className={clsx(
                      'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                      e.pbDetail ? 'bg-accent-soft' : 'bg-surface',
                    )}
                  >
                    <span className="text-success">✓</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {e.athleteName} · {e.metric.label}
                      {e.side ? ` (${SIDE_LABELS[e.side]})` : ''}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatValue(e.value, e.metric.unit)}
                    </span>
                    {e.pbDetail && (
                      <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white">
                        PB {e.pbDetail}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void undo(e)}
                      aria-label="Eintrag löschen"
                      className="ml-1 rounded-lg px-2 py-1 text-foreground-subtle transition hover:bg-danger/10 hover:text-danger"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Ziffernfeld */}
          <div className="flex flex-col gap-3">
            <NumericKeypad
              onDigit={appendDigit}
              onDecimal={appendDecimal}
              onDelete={deleteLast}
              disabled={saving}
            />
            <Button size="lg" className="h-16 text-lg" disabled={!canSave || saving} onClick={() => void save()}>
              {/* Gesperrt? Dann direkt sagen, was noch fehlt. */}
              {saving
                ? 'Speichern …'
                : !athlete
                  ? 'Erst Namen antippen'
                  : !metric
                    ? 'Erst Übung wählen'
                    : !canSave
                      ? 'Wert eingeben'
                      : 'Speichern'}
            </Button>
          </div>
        </div>
      </section>

      {celebration && (
        <Fireworks
          key={celebration.id}
          detail={celebration.detail}
          onDone={() => setCelebration(null)}
        />
      )}
    </main>
  );
}

function Avatar({ name, active }: { name: string; active: boolean }) {
  return (
    <span
      className={clsx(
        'grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-sm font-bold',
        active
          ? 'bg-accent text-white'
          : 'bg-gradient-to-br from-accent to-accent-strong text-white opacity-80',
      )}
    >
      {initials(name)}
    </span>
  );
}
