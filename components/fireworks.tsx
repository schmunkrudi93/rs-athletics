'use client';

import { useEffect, useRef, useState } from 'react';
import { clsx } from '@/lib/clsx';

/** Festliche Farben für die Partikel. */
const COLORS = ['#fbbf24', '#f97316', '#ef4444', '#22d3ee', '#a855f7', '#34d399', '#f472b6'];

/** Motivierende Sprüche – einer wird je Bestleistung zufällig gewählt. */
const MESSAGES = [
  'Jetzt drauf aufbauen.',
  'Dein Standard steigt!',
  'Jetzt nicht nachlassen.',
  'Stabil!',
  'Good job!',
  'Ich bin stolz auf dich!',
  'Level up!',
  'Genau in die richtige Richtung!',
  'Die harte Arbeit zahlt sich aus!',
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type FireworksProps = {
  /** Wird genau einmal aufgerufen, wenn das Overlay verschwinden soll. */
  onDone?: () => void;
  /** Zusatzzeile unter der Überschrift, z. B. „−0,06 s schneller". */
  detail?: string;
  /** Gesamtdauer in ms (Karte + Feuerwerk). */
  durationMs?: number;
};

/**
 * Glückwunsch-Overlay bei persönlicher Bestleistung: Feuerwerk (Canvas, ohne
 * externe Abhängigkeit) hinter einer Popup-Karte (🔥 Neue Bestleistung! + Delta
 * + zufälliger Spruch). `prefers-reduced-motion` wird respektiert. Tippen oder
 * der Sicherheits-Timer beenden das Overlay zuverlässig.
 */
export function Fireworks({ onDone, detail, durationMs = 3600 }: FireworksProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finishRef = useRef<() => void>(() => {});
  const [message] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let finished = false;
    let raf = 0;
    let timeout = 0;
    let resize = () => {};

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener('resize', resize);
      onDoneRef.current?.();
    };
    finishRef.current = finish;

    // Karte einblenden (im nächsten Frame, damit die Transition greift).
    const showRaf = requestAnimationFrame(() => setShown(true));
    // Sicherheitsnetz: Overlay verschwindet garantiert, auch ohne Canvas.
    timeout = window.setTimeout(finish, durationMs + 600);

    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;

    if (canvas && ctx) {
      const reduce =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let W = 0;
      let H = 0;
      resize = () => {
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resize();
      window.addEventListener('resize', resize);

      const particles: Particle[] = [];
      const burst = (cx: number, cy: number) => {
        const n = reduce ? 24 : 46;
        const base = COLORS[Math.floor(Math.random() * COLORS.length)];
        for (let i = 0; i < n; i++) {
          const ang = (Math.PI * 2 * i) / n + Math.random() * 0.25;
          const sp = 2 + Math.random() * 4.5;
          particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            life: 0,
            maxLife: 55 + Math.random() * 35,
            color: Math.random() < 0.6 ? base : COLORS[Math.floor(Math.random() * COLORS.length)],
            size: 1.5 + Math.random() * 2.5,
          });
        }
      };
      const launch = () =>
        burst(W * (0.18 + Math.random() * 0.64), H * (0.16 + Math.random() * 0.34));

      const start = performance.now();
      let lastBurst = start;
      launch();

      const tick = (now: number) => {
        const elapsed = now - start;
        ctx.clearRect(0, 0, W, H);

        if (elapsed < durationMs - 900 && now - lastBurst > (reduce ? 650 : 300)) {
          launch();
          lastBurst = now;
        }

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life += 1;
          if (p.life >= p.maxLife) {
            particles.splice(i, 1);
            continue;
          }
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.06; // Schwerkraft
          p.vx *= 0.99;
          p.vy *= 0.99;
          ctx.globalAlpha = 1 - p.life / p.maxLife;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        if (elapsed < durationMs) raf = requestAnimationFrame(tick);
        else finish();
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      finished = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(showRaf);
      window.clearTimeout(timeout);
      window.removeEventListener('resize', resize);
    };
  }, [durationMs]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-6"
      role="alertdialog"
      aria-label="Neue persönliche Bestleistung"
      onClick={() => finishRef.current()}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div
        aria-live="polite"
        className={clsx(
          'relative flex flex-col items-center gap-1 rounded-2xl border border-accent/40 bg-surface/95 px-7 py-6 text-center shadow-card backdrop-blur transition-all duration-300',
          shown ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
        )}
      >
        <p className="font-display text-xl font-bold text-foreground">🔥 Neue Bestleistung!</p>
        {detail && <p className="stat-number text-3xl font-bold text-accent">{detail}</p>}
        <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      </div>
    </div>
  );
}
