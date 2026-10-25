/**
 * Anzeige-Formatierung (deutsche Konventionen: Komma als Dezimaltrenner).
 */

// Nachkommastellen je Einheit (min/max).
const PRECISION: Record<string, { min: number; max: number }> = {
  s: { min: 2, max: 2 }, // Sprintzeiten: 1,81 s
  'm/s': { min: 1, max: 2 }, // 9,2 m/s
  cm: { min: 0, max: 1 }, // 245 cm
  '%': { min: 1, max: 1 }, // Körperfett: 16,1 %
};
const DEFAULT_PRECISION = { min: 0, max: 2 }; // u. a. RSI (einheitslos)

function precisionFor(unit: string) {
  return PRECISION[unit] ?? DEFAULT_PRECISION;
}

/** Reine Zahl im de-DE-Format (Komma), passend zur Einheit. */
export function formatNumber(value: number, unit = ''): string {
  const { min, max } = precisionFor(unit);
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(value);
}

/** Wert inkl. Einheit, z. B. „1,81 s" oder „245 cm" (RSI ohne Einheit). */
export function formatValue(value: number, unit = ''): string {
  const num = formatNumber(value, unit);
  return unit ? `${num} ${unit}` : num;
}

/** Vorzeichenbehaftete Differenz, z. B. „+0,03 s" / „−2 cm". */
export function formatDelta(delta: number, unit = ''): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const num = formatNumber(Math.abs(delta), unit);
  return unit ? `${sign}${num} ${unit}` : `${sign}${num}`;
}

/** Vorzeichenbehaftete Prozentangabe, z. B. „+3,2 %" / „−1 %". */
export function formatPercentDelta(pct: number): string {
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  const num = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(Math.abs(pct));
  return `${sign}${num} %`;
}

/** Prozentangabe ohne Vorzeichen, z. B. „3,2 %". */
export function formatPercent(pct: number): string {
  const num = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(pct);
  return `${num} %`;
}

/** Datum im Format TT.MM.JJJJ. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Kurzdatum für Achsen/Listen, z. B. „6. Jun". */
export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/** Initialen aus einem Namen, z. B. „Max Mustermann" -> „MM". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Heutiges Datum (lokal) als YYYY-MM-DD – z. B. als max für <input type="date">. */
export function todayISO(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Alter in vollen Jahren aus einem Geburtsdatum (YYYY-MM-DD); null wenn ungültig. */
export function computeAge(birthIso: string | null | undefined): number | null {
  if (!birthIso) return null;
  const [y, m, d] = birthIso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const month = today.getMonth() + 1;
  if (month < m || (month === m && today.getDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Alters-Label, z. B. „17 J."; null wenn kein/ungültiges Datum. */
export function ageLabel(birthIso: string | null | undefined): string | null {
  const age = computeAge(birthIso);
  return age == null ? null : `${age} J.`;
}
