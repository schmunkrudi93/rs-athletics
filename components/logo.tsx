import { clsx } from '@/lib/clsx';

export type LogoVariant = 'submark' | 'horizontal' | 'primary' | 'stacked';

type LogoProps = {
  /** Welche Marke. Default: horizontal („RS | ATHLETICS"). */
  variant?: LogoVariant;
  /** Höhe in px; die Breite folgt automatisch dem Seitenverhältnis der Marke. */
  height?: number;
  className?: string;
};

/**
 * Marken-Logo (RS Athletics) als echtes Vektor-SVG aus /public/brand.
 * Helle „on-dark"-Variante (weiße Schrift, blaue Speed-Lines) fürs dunkle UI.
 * Vier Marken:
 *  - submark:    nur das „RS"-Zeichen mit Speed-Lines (Lade-/Splash-Zustände)
 *  - horizontal: „RS | ATHLETICS" kompakt, ohne Unterzeilen (Top-Bar)
 *  - primary:    horizontaler Lockup MIT Unterzeilen
 *  - stacked:    RS oben, ATHLETICS darunter, mit Unterzeilen (Login-Header)
 *
 * Breite = auto, damit ein späterer Re-Export mit anderem viewBox automatisch
 * passt; `max-w-full` verhindert Überlauf auf schmalen Screens.
 */
export function Logo({ variant = 'horizontal', height = 32, className }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- statisches SVG-Logo, keine next/image-Optimierung nötig
    <img
      src={`/brand/rs-${variant}.svg`}
      alt="RS Athletics"
      style={{ height, width: 'auto' }}
      className={clsx('block max-w-full select-none', className)}
      draggable={false}
    />
  );
}
