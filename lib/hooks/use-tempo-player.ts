'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PHASE_TONE,
  buildTimeline,
  repDoneTimes,
  type Segment,
  type TempoSettings,
} from '@/lib/tempo';

export type PlayerStatus = 'idle' | 'running' | 'paused' | 'done';

export type PlayerState = {
  status: PlayerStatus;
  /** Sekunden seit Start-Tipp (läuft im Pausenmodus nicht weiter). */
  elapsed: number;
  segment: Segment | null;
  /** Bereits geschaffte Wiederholungen. */
  repsDone: number;
  total: number;
};

const IDLE: PlayerState = { status: 'idle', elapsed: 0, segment: null, repsDone: 0, total: 0 };

/**
 * Metronom-Engine fürs Tempotraining.
 *
 * Alle Töne werden beim Start komplett auf der Web-Audio-Uhr vorgeplant – das
 * ist sekundengenau, auch wenn der JS-Thread mal hängt. Pause = AudioContext
 * anhalten (die Uhr steht dann still), Stopp = AudioContext schließen.
 * Die Wiederholungszahl kommt per Sprachausgabe (speechSynthesis, de-DE).
 */
export function useTempoPlayer() {
  const [state, setState] = useState<PlayerState>(IDLE);

  const ctxRef = useRef<AudioContext | null>(null);
  const t0Ref = useRef(0);
  const timelineRef = useRef<Segment[]>([]);
  const repTimesRef = useRef<number[]>([]);
  const announcedRef = useRef(0);
  const voiceRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const statusRef = useRef<PlayerStatus>('idle');

  const setStatus = (status: PlayerStatus) => {
    statusRef.current = status;
  };

  // --- Bildschirm wach halten (Handy im Stativ) ---------------------------
  const lockScreen = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // Nicht unterstützt / abgelehnt – dann eben ohne.
    }
  }, []);

  const unlockScreen = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceRef.current || typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 1.1;
    window.speechSynthesis.cancel(); // nie Ansagen stauen lassen
    window.speechSynthesis.speak(u);
  }, []);

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    // Kurz verzögert schließen, damit der Abschluss-Ton ausklingt.
    if (ctx) setTimeout(() => ctx.close().catch(() => {}), 800);
    unlockScreen();
  }, [unlockScreen]);

  // --- Fortschritt aus der Audio-Uhr ableiten --------------------------------
  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const elapsed = Math.max(0, ctx.currentTime - t0Ref.current);
    const timeline = timelineRef.current;
    const total = timeline[timeline.length - 1].end;
    const segment = timeline.find((s) => elapsed < s.end) ?? null;

    const repsDone = repTimesRef.current.filter((t) => elapsed >= t).length;
    if (repsDone > announcedRef.current) {
      announcedRef.current = repsDone;
      const isLast = repsDone === repTimesRef.current.length;
      speak(isLast ? `${repsDone}. Fertig` : String(repsDone));
    }

    if (elapsed >= total) {
      setStatus('done');
      setState({ status: 'done', elapsed: total, segment: null, repsDone, total });
      teardown();
      return;
    }
    setState({ status: 'running', elapsed, segment, repsDone, total });
  }, [speak, teardown]);

  const stop = useCallback(() => {
    setStatus('idle');
    window.speechSynthesis?.cancel();
    teardown();
    setState(IDLE);
  }, [teardown]);

  const start = useCallback(
    (settings: TempoSettings) => {
      stop();
      const Ctx: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      void ctx.resume(); // iOS: muss im Tipp-Handler passieren
      ctxRef.current = ctx;

      // iOS gibt die Sprachausgabe erst nach einem Aufruf im Tipp-Handler frei.
      voiceRef.current = settings.voice;
      if (settings.voice && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      }

      const timeline = buildTimeline(settings);
      timelineRef.current = timeline;
      repTimesRef.current = repDoneTimes(timeline, settings.reps);
      announcedRef.current = 0;
      const t0 = ctx.currentTime + 0.15;
      t0Ref.current = t0;

      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      /** Ein kurzer Ton mit schnellem Anschlag und Abklingen. */
      const beep = (at: number, freq: number, type: OscillatorType, dur: number, vol: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(g).connect(master);
        osc.start(at);
        osc.stop(at + dur + 0.02);
      };

      for (const seg of timeline) {
        const len = Math.round(seg.end - seg.start);
        for (let k = 0; k < len; k++) {
          const at = t0 + seg.start + k;
          if (seg.kind === 'countdown') {
            // Vorlauf: neutrale Klicks, die letzten 3 etwas lauter.
            const last3 = len - k <= 3;
            beep(at, 1200, 'sine', 0.05, last3 ? 0.35 : 0.18);
          } else {
            const tone = PHASE_TONE[seg.phase];
            // Phasenbeginn = langer, lauter Ton; jede weitere Sekunde = kurzer Klick.
            if (k === 0) beep(at, tone.freq, tone.type, 0.22, 0.4);
            else beep(at, tone.freq, tone.type, 0.045, 0.2);
          }
        }
      }
      // Abschluss: kleiner Dreiklang nach oben.
      const end = t0 + timeline[timeline.length - 1].end;
      [880, 1109, 1319].forEach((f, i) => beep(end + i * 0.12, f, 'triangle', 0.25, 0.35));

      setStatus('running');
      void lockScreen();
      timerRef.current = setInterval(tick, 50);
      tick();
    },
    [lockScreen, stop, tick],
  );

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || statusRef.current !== 'running') return;
    setStatus('paused');
    void ctx.suspend();
    window.speechSynthesis?.cancel();
    setState((s) => ({ ...s, status: 'paused' }));
  }, []);

  const resume = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || statusRef.current !== 'paused') return;
    setStatus('running');
    void ctx.resume();
    void lockScreen();
    setState((s) => ({ ...s, status: 'running' }));
  }, [lockScreen]);

  // Wake-Lock fällt beim App-Wechsel weg – beim Zurückkommen neu holen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && statusRef.current === 'running') void lockScreen();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [lockScreen]);

  // Beim Verlassen der Seite alles sauber beenden.
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    teardown();
  }, [teardown]);

  return { state, start, pause, resume, stop };
}
