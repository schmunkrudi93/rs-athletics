import { clsx } from '@/lib/clsx';

type LogoProps = {
  /** Größe des Monogramm-Quadrats in px */
  size?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  className?: string;
};

/**
 * Marken-Logo als sauberer Platzhalter ("RS ATHLETICS").
 * Sobald ein echtes Logo unter /public/logo.png liegt, kann hier auf
 * ein <img src="/logo.png" /> umgestellt werden — der Rest der App nutzt
 * ausschließlich diese Komponente.
 */
export function Logo({
  size = 44,
  showWordmark = true,
  showTagline = false,
  className,
}: LogoProps) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <div
        aria-hidden
        className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-strong font-display font-bold leading-none text-white shadow-card"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        RS
      </div>
      {showWordmark && (
        <div className="leading-tight">
          <div className="font-display text-lg font-bold tracking-wide text-foreground">
            RS ATHLETICS
          </div>
          {showTagline && (
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-foreground-muted">
              Train Fast. Play Faster.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
