'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { clsx } from '@/lib/clsx';
import { getActiveSession } from '@/lib/auth-client';
import { useTempoPlayer, type PlayerState } from '@/lib/hooks/use-tempo-player';
import {
  COUNTDOWN_LIMITS,
  DEFAULT_SETTINGS,
  PHASE_COLOR,
  PHASE_LIMITS,
  REP_LIMITS,
  loadLastSettings,
  loadPresets,
  phaseOrder,
  repDuration,
  saveLastSettings,
  savePresets,
  tempoNotation,
  type StartWith,
  type TempoPreset,
  type TempoSettings,
} from '@/lib/tempo';

const sameSettings = (a: TempoSettings, b: TempoSettings) => JSON.stringify(a) === JSON.stringify(b);

/** Tempo-Timer: Metronom + Wiederholungszähler fürs Tempotraining (rein lokal). */
export function TempoTimer() {
  const [settings, setSettings] = useState<TempoSettings>(DEFAULT_SETTINGS);
  const [presets, setPresets] = useState<TempoPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [backHref, setBackHref] = useState('/');
  const player = useTempoPlayer();

  // localStorage gibt's erst im Browser – daher nach dem Mount laden.
  useEffect(() => {
    setSettings(loadLastSettings());
    setPresets(loadPresets());
    getActiveSession()
      .then((s) => s && setBackHref(s.role === 'coach' ? '/coach' : '/athlet'))
      .catch(() => {});
  }, []);

  const update = (patch: Partial<TempoSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Mindestens 1 Sekunde pro Wiederholung, sonst gibt es nichts zu zählen.
      if (repDuration(next) === 0) return prev;
      saveLastSettings(next);
      return next;
    });
  };

  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;
  const presetDirty = activePreset ? !sameSettings(activePreset.settings, settings) : false;

  const persistPresets = (next: TempoPreset[]) => {
    setPresets(next);
    savePresets(next);
  };

  const loadPreset = (p: TempoPreset) => {
    setActivePresetId(p.id);
    setSettings(p.settings);
    saveLastSettings(p.settings);
  };

  const saveNewPreset = () => {
    const name = presetName.trim() || `Tempo ${tempoNotation(settings)}`;
    const preset: TempoPreset = { id: `p-${Date.now()}`, name, settings };
    persistPresets([...presets, preset]);
    setActivePresetId(preset.id);
    setNaming(false);
    setPresetName('');
  };

  const overwritePreset = () => {
    if (!activePreset) return;
    persistPresets(presets.map((p) => (p.id === activePreset.id ? { ...p, settings } : p)));
  };

  const deletePreset = () => {
    if (!activePreset) return;
    if (!window.confirm(`Preset „${activePreset.name}" löschen?`)) return;
    persistPresets(presets.filter((p) => p.id !== activePreset.id));
    setActivePresetId(null);
  };

  const order = phaseOrder(settings.startWith);
  const perRep = repDuration(settings);

  return (
    <div className="min-h-dvh pb-12">
      <TopBar showTempoLink={false} />

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Tempo-Timer</h1>
            <p className="text-sm text-foreground-muted">Metronom &amp; Wiederholungszähler</p>
          </div>
          <Link
            href={backHref}
            className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3 text-sm font-medium text-foreground transition hover:border-accent/50"
          >
            Zurück
          </Link>
        </div>

        {/* ---- Presets ---- */}
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Presets</h2>
          {presets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => loadPreset(p)}
                  className={clsx(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                    p.id === activePresetId
                      ? 'border-transparent bg-accent-strong text-white'
                      : 'border-line bg-surface-muted text-foreground-muted hover:text-foreground',
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground-subtle">Noch keine Presets gespeichert.</p>
          )}

          {naming ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNewPreset()}
                placeholder={`z. B. Kniebeuge ${tempoNotation(settings)}`}
                maxLength={40}
                className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-background px-3 text-sm text-foreground placeholder:text-foreground-subtle"
              />
              <Button size="sm" onClick={saveNewPreset}>
                Speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setNaming(true)}>
                Als neues Preset speichern
              </Button>
              {activePreset && presetDirty && (
                <Button size="sm" variant="outline" onClick={overwritePreset}>
                  „{activePreset.name}“ aktualisieren
                </Button>
              )}
              {activePreset && (
                <Button size="sm" variant="danger" onClick={deletePreset}>
                  Löschen
                </Button>
              )}
            </div>
          )}
        </section>

        {/* ---- Tempo ---- */}
        <section className="card flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground">Übung beginnt mit</span>
            <Segmented<StartWith>
              wrap
              options={[
                { key: 'ecc', label: 'Exzentrik (z. B. Kniebeuge)' },
                { key: 'con', label: 'Konzentrik (z. B. Beinstrecker)' },
              ]}
              value={settings.startWith}
              onChange={(startWith) => update({ startWith })}
            />
          </div>

          <div className="flex flex-col divide-y divide-line">
            {order.map((p, i) => (
              <Stepper
                key={p.key}
                label={
                  <span className="flex items-center gap-2">
                    <span className="w-4 text-xs tabular-nums text-foreground-subtle">{i + 1}.</span>
                    <span className={clsx('h-2.5 w-2.5 rounded-full', PHASE_COLOR[p.key].bg)} />
                    {p.label}
                  </span>
                }
                value={settings[p.key]}
                unit="s"
                min={PHASE_LIMITS.min}
                max={PHASE_LIMITS.max}
                onChange={(v) => update({ [p.key]: v })}
              />
            ))}
          </div>

          <p className="text-sm text-foreground-muted">
            Tempo <span className="font-semibold text-foreground">{tempoNotation(settings)}</span> ·{' '}
            {perRep} s pro Wdh. · Satz ca. {perRep * settings.reps - settings.pause} s
          </p>
        </section>

        {/* ---- Satz ---- */}
        <section className="card flex flex-col divide-y divide-line px-4 py-1">
          <Stepper
            label="Wiederholungen"
            value={settings.reps}
            min={REP_LIMITS.min}
            max={REP_LIMITS.max}
            onChange={(reps) => update({ reps })}
          />
          <Stepper
            label="Vorlauf nach Start"
            value={settings.countdown}
            unit="s"
            min={COUNTDOWN_LIMITS.min}
            max={COUNTDOWN_LIMITS.max}
            onChange={(countdown) => update({ countdown })}
          />
          <label className="flex items-center justify-between py-3 text-sm text-foreground">
            Wiederholung ansagen
            <input
              type="checkbox"
              checked={settings.voice}
              onChange={(e) => update({ voice: e.target.checked })}
              className="h-5 w-5 accent-[#1C5192]"
            />
          </label>
        </section>

        <Button size="lg" onClick={() => player.start(settings)}>
          Start
        </Button>

        <p className="text-xs text-foreground-subtle">
          Jede Phase hat einen eigenen Ton: Phasenbeginn = langer Ton, jede weitere Sekunde = kurzer
          Klick. iPhone: Stumm-Schalter aus, sonst bleibt der Timer leise. Der Bildschirm bleibt
          während des Satzes an.
        </p>
      </main>

      {player.state.status !== 'idle' && (
        <RunView
          state={player.state}
          reps={settings.reps}
          onPause={player.pause}
          onResume={player.resume}
          onStop={player.stop}
          onRestart={() => player.start(settings)}
        />
      )}
    </div>
  );
}

/** −/+ Zeile für eine ganze Zahl. */
function Stepper({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: React.ReactNode;
  value: number;
  unit?: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn =
    'flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-muted text-lg text-foreground transition active:scale-95 disabled:opacity-40';
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="weniger">
          −
        </button>
        <span className="stat-number w-12 text-center text-lg">
          {value}
          {unit && <span className="ml-0.5 text-sm text-foreground-muted">{unit}</span>}
        </span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="mehr">
          +
        </button>
      </div>
    </div>
  );
}

/** Vollbild während des Satzes – groß genug, um es vom Stativ aus zu lesen. */
function RunView({
  state,
  reps,
  onPause,
  onResume,
  onStop,
  onRestart,
}: {
  state: PlayerState;
  reps: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestart: () => void;
}) {
  const { status, segment, elapsed, repsDone } = state;
  const remaining = segment ? Math.max(1, Math.ceil(segment.end - elapsed - 1e-6)) : 0;
  const progress = segment ? (elapsed - segment.start) / (segment.end - segment.start) : 1;

  const head = useMemo(() => {
    if (status === 'done') return { title: 'Fertig!', color: 'text-success', bar: 'bg-success' };
    if (!segment || segment.kind === 'countdown')
      return { title: 'Gleich geht’s los', color: 'text-foreground', bar: 'bg-foreground-muted' };
    const c = PHASE_COLOR[segment.phase];
    return { title: segment.label, color: c.text, bar: c.bg };
  }, [status, segment]);

  const currentRep = segment?.kind === 'phase' ? segment.rep : status === 'done' ? reps : 0;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-background pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
        {/* Wiederholungen */}
        <div className="flex items-baseline justify-between">
          <span className="text-sm uppercase tracking-wide text-foreground-muted">Wiederholung</span>
          <span className="stat-number text-4xl">
            {currentRep}
            <span className="text-2xl text-foreground-muted"> / {reps}</span>
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: reps }, (_, i) => (
            <span
              key={i}
              className={clsx('h-1.5 flex-1 rounded-full', i < repsDone ? 'bg-success' : 'bg-surface-muted')}
            />
          ))}
        </div>

        {/* Phase + Sekunden */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className={clsx('font-display text-4xl font-bold uppercase sm:text-5xl', head.color)}>
            {head.title}
          </span>
          {status === 'done' ? (
            <span className="text-lg text-foreground-muted">{reps} Wiederholungen geschafft</span>
          ) : (
            <span className={clsx('stat-number text-[9rem] leading-none sm:text-[12rem]', head.color)}>
              {remaining}
            </span>
          )}
          {status !== 'done' && (
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-surface-muted">
              <div
                className={clsx('h-full rounded-full transition-[width] duration-75 ease-linear', head.bar)}
                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
              />
            </div>
          )}
          {status === 'paused' && <span className="text-lg font-semibold text-warning">Pausiert</span>}
        </div>

        {/* Steuerung */}
        <div className="grid grid-cols-2 gap-3">
          {status === 'done' ? (
            <>
              <Button size="lg" variant="outline" onClick={onStop}>
                Zurück
              </Button>
              <Button size="lg" onClick={onRestart}>
                Nochmal
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" variant="outline" onClick={onStop}>
                Stopp
              </Button>
              {status === 'paused' ? (
                <Button size="lg" onClick={onResume}>
                  Weiter
                </Button>
              ) : (
                <Button size="lg" onClick={onPause}>
                  Pause
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
