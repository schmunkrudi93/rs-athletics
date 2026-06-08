'use client';

import { clsx } from '@/lib/clsx';

type NumericKeypadProps = {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Großflächiges Ziffern-Tastenfeld (mobile-first, Airtable-Stil). */
export function NumericKeypad({ onDigit, onDelete, disabled }: NumericKeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {DIGITS.map((d) => (
        <KeypadButton key={d} disabled={disabled} onClick={() => onDigit(d)}>
          {d}
        </KeypadButton>
      ))}
      {/* untere Reihe: leer | 0 | löschen */}
      <span aria-hidden />
      <KeypadButton disabled={disabled} onClick={() => onDigit('0')}>
        0
      </KeypadButton>
      <KeypadButton disabled={disabled} onClick={onDelete} ariaLabel="Letzte Ziffer löschen">
        <span className="text-2xl leading-none">⌫</span>
      </KeypadButton>
    </div>
  );
}

function KeypadButton({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'grid h-16 select-none place-items-center rounded-2xl border border-line bg-surface',
        'font-display text-2xl font-semibold text-foreground',
        'transition active:scale-[0.97] active:bg-surface-muted',
        'hover:border-accent/40 disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}
