/**
 * Tempo-Training: Datenmodell, Ablaufplan und lokale Presets.
 *
 * Eine Wiederholung besteht aus 4 festen Phasen. Die Reihenfolge hängt davon ab,
 * womit die Übung beginnt:
 *   - Exzentrik zuerst (z. B. Kniebeuge):  Exzentrik → Halten unten → Konzentrik → Pause oben
 *   - Konzentrik zuerst (z. B. Beinstrecker): Konzentrik → Halten oben → Exzentrik → Pause unten
 * Phasen mit 0 Sekunden werden übersprungen.
 *
 * Alles bleibt lokal im Gerät (localStorage) – keine Datenbank.
 */

export type PhaseKey = 'ecc' | 'hold' | 'con' | 'pause';
export type StartWith = 'ecc' | 'con';

export type TempoSettings = {
  startWith: StartWith;
  /** Sekunden je Phase (ganzzahlig, 0 = Phase aus). */
  ecc: number;
  hold: number;
  con: number;
  pause: number;
  reps: number;
  /** Vorlauf nach „Start", bevor die erste Wiederholung beginnt. */
  countdown: number;
  /** Wiederholungszahl per Sprachausgabe ansagen. */
  voice: boolean;
};

export type TempoPreset = { id: string; name: string; settings: TempoSettings };

export const PHASE_LIMITS = { min: 0, max: 10 };
export const REP_LIMITS = { min: 1, max: 30 };
export const COUNTDOWN_LIMITS = { min: 3, max: 10 };

/** Ton je Phase: Tonhöhe (Hz) + Wellenform – damit man sie blind unterscheidet. */
export const PHASE_TONE: Record<PhaseKey, { freq: number; type: OscillatorType }> = {
  ecc: { freq: 440, type: 'square' }, // tief = runter/nachgeben
  hold: { freq: 660, type: 'triangle' }, // mittel = halten
  con: { freq: 990, type: 'square' }, // hoch = drücken
  pause: { freq: 330, type: 'sine' }, // weich = durchatmen
};

/** Tailwind-Klassen je Phase für die Laufansicht. */
export const PHASE_COLOR: Record<PhaseKey, { text: string; bg: string }> = {
  ecc: { text: 'text-accent', bg: 'bg-accent' },
  hold: { text: 'text-warning', bg: 'bg-warning' },
  con: { text: 'text-success', bg: 'bg-success' },
  pause: { text: 'text-foreground-muted', bg: 'bg-foreground-muted' },
};

/** Phasen in Ablaufreihenfolge, inkl. passender Beschriftung (oben/unten). */
export function phaseOrder(startWith: StartWith): { key: PhaseKey; label: string }[] {
  return startWith === 'ecc'
    ? [
        { key: 'ecc', label: 'Exzentrik' },
        { key: 'hold', label: 'Halten unten' },
        { key: 'con', label: 'Konzentrik' },
        { key: 'pause', label: 'Pause oben' },
      ]
    : [
        { key: 'con', label: 'Konzentrik' },
        { key: 'hold', label: 'Halten oben' },
        { key: 'ecc', label: 'Exzentrik' },
        { key: 'pause', label: 'Pause unten' },
      ];
}

/** Kurzschreibweise in Ablaufreihenfolge, z. B. „3-2-2-1". */
export function tempoNotation(s: TempoSettings): string {
  return phaseOrder(s.startWith)
    .map((p) => s[p.key])
    .join('-');
}

export function repDuration(s: TempoSettings): number {
  return s.ecc + s.hold + s.con + s.pause;
}

/** Ein Abschnitt im Ablaufplan (Zeiten in Sekunden ab Start-Tipp). */
export type Segment =
  | { kind: 'countdown'; start: number; end: number }
  | { kind: 'phase'; start: number; end: number; phase: PhaseKey; label: string; rep: number };

/**
 * Kompletter Ablaufplan eines Satzes: Vorlauf, dann alle Wiederholungen.
 * Wird vorab berechnet, damit Töne exakt auf der Audio-Uhr geplant werden können.
 */
export function buildTimeline(s: TempoSettings): Segment[] {
  const segments: Segment[] = [{ kind: 'countdown', start: 0, end: s.countdown }];
  let t = s.countdown;
  const order = phaseOrder(s.startWith);
  for (let rep = 1; rep <= s.reps; rep++) {
    for (const p of order) {
      const dur = s[p.key];
      if (dur <= 0) continue;
      // Nach der letzten Wiederholung keine Übergangspause mehr – der Satz ist fertig.
      if (rep === s.reps && p.key === 'pause') continue;
      segments.push({ kind: 'phase', start: t, end: t + dur, phase: p.key, label: p.label, rep });
      t += dur;
    }
  }
  return segments;
}

/**
 * Zeitpunkt (s), an dem Wiederholung n „geschafft" ist und angesagt wird: Ende der
 * letzten Bewegungs-/Halte-Phase – also vor der Übergangspause, damit die Zahl
 * genau dann kommt, wenn man sich resettet und einatmet.
 */
export function repDoneTimes(timeline: Segment[], reps: number): number[] {
  const times: number[] = [];
  for (let rep = 1; rep <= reps; rep++) {
    let t = 0;
    for (const seg of timeline) {
      if (seg.kind === 'phase' && seg.rep === rep && seg.phase !== 'pause') t = seg.end;
    }
    times.push(t);
  }
  return times;
}

// ---------------------------------------------------------------------------
// Presets (lokal)
// ---------------------------------------------------------------------------

const PRESETS_KEY = 'rs-tempo-presets';
const LAST_KEY = 'rs-tempo-last';

export const DEFAULT_SETTINGS: TempoSettings = {
  startWith: 'ecc',
  ecc: 3,
  hold: 2,
  con: 2,
  pause: 3,
  reps: 6,
  countdown: 5,
  voice: true,
};

/** Startbelegung, solange noch nichts gespeichert wurde. */
const SEED_PRESETS: TempoPreset[] = [
  { id: 'seed-squat', name: 'Kniebeuge 3-2-2-3', settings: { ...DEFAULT_SETTINGS } },
  {
    id: 'seed-legext',
    name: 'Beinstrecker 4-0-5-0',
    settings: { ...DEFAULT_SETTINGS, startWith: 'con', con: 4, hold: 0, ecc: 5, pause: 0, reps: 10 },
  },
];

const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;

/** Gespeicherte Werte defensiv einlesen (alte/kaputte Einträge nicht crashen lassen). */
export function sanitizeSettings(raw: unknown): TempoSettings {
  const r = (raw ?? {}) as Partial<TempoSettings>;
  const d = DEFAULT_SETTINGS;
  const s: TempoSettings = {
    startWith: r.startWith === 'con' ? 'con' : 'ecc',
    ecc: clamp(r.ecc, PHASE_LIMITS.min, PHASE_LIMITS.max, d.ecc),
    hold: clamp(r.hold, PHASE_LIMITS.min, PHASE_LIMITS.max, d.hold),
    con: clamp(r.con, PHASE_LIMITS.min, PHASE_LIMITS.max, d.con),
    pause: clamp(r.pause, PHASE_LIMITS.min, PHASE_LIMITS.max, d.pause),
    reps: clamp(r.reps, REP_LIMITS.min, REP_LIMITS.max, d.reps),
    countdown: clamp(r.countdown, COUNTDOWN_LIMITS.min, COUNTDOWN_LIMITS.max, d.countdown),
    voice: typeof r.voice === 'boolean' ? r.voice : d.voice,
  };
  // Eine Wiederholung braucht mindestens 1 Sekunde.
  if (repDuration(s) === 0) s.con = 1;
  return s;
}

function readJson(key: string): unknown {
  try {
    const v = window.localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Privatmodus / voller Speicher: dann eben ohne Merken.
  }
}

export function loadPresets(): TempoPreset[] {
  const raw = readJson(PRESETS_KEY);
  if (!Array.isArray(raw)) return SEED_PRESETS;
  return raw
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p) => ({ id: p.id, name: p.name, settings: sanitizeSettings(p.settings) }));
}

export function savePresets(presets: TempoPreset[]) {
  writeJson(PRESETS_KEY, presets);
}

export function loadLastSettings(): TempoSettings {
  const raw = readJson(LAST_KEY);
  return raw ? sanitizeSettings(raw) : DEFAULT_SETTINGS;
}

export function saveLastSettings(s: TempoSettings) {
  writeJson(LAST_KEY, s);
}
