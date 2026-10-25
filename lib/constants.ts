/**
 * Zentrale Konstanten für Zugang & Datenmodell.
 */

/** Interne E-Mail-Domain: Der Zahlencode wird zu {code}@DOMAIN umgesetzt. */
export const AUTH_EMAIL_DOMAIN = 'rs-athletics.local';

/** Länge des Zahlencodes. */
export const CODE_LENGTH = 6;

/** Rollen aus der profiles-Tabelle. */
export type Role = 'athlete' | 'coach';

/** Metrik-Kategorien (erweiterbar ohne Schemaänderung). */
export type MetricCategory =
  | 'sprint'
  | 'jump'
  | 'strength'
  | 'cod'
  | 'endurance'
  | 'custom'
  | 'health';

/** Anzeige-Reihenfolge der Reiter. Im Dashboard werden nur Kategorien gezeigt,
 *  die tatsächlich (aktive) Metriken haben – leere Reiter bleiben aus. */
export const CATEGORY_ORDER: MetricCategory[] = [
  'sprint',
  'jump',
  'strength',
  'cod',
  'endurance',
  'custom',
  'health', // nur bei athletes.health_enabled (siehe athlete-dashboard)
];

/** Fallback-Reiter, falls (noch) keine Metriken geladen sind. */
export const VISIBLE_CATEGORIES: MetricCategory[] = ['sprint', 'jump'];

/** Code (nur Ziffern) -> interne Login-E-Mail. */
export function codeToEmail(code: string): string {
  return `${code}@${AUTH_EMAIL_DOMAIN}`;
}

/** Prüft, ob ein String ein gültiger Zahlencode ist. */
export function isValidCode(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}
