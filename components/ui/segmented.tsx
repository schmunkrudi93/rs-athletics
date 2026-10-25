'use client';

import { clsx } from '@/lib/clsx';

type SegmentedProps<T extends string> = {
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** Volle Breite, Optionen brechen in weitere Zeilen um (statt horizontal zu
   *  scrollen) – so bleiben alle Reiter sichtbar, auch auf schmalen Handys. */
  wrap?: boolean;
  className?: string;
};

/** Segment-Umschalter (für Reiter & Zeitfilter). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  wrap = false,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-line bg-surface p-1',
        wrap ? 'flex w-full flex-wrap gap-1' : 'inline-flex',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={clsx(
            'rounded-lg font-medium transition',
            // Im Umbruch-Modus füllen die Knöpfe ihre Zeile gleichmäßig auf.
            wrap && 'flex-auto whitespace-nowrap text-center',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.key
              ? 'bg-accent-strong text-white shadow-card'
              : 'text-foreground-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
