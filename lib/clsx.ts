/**
 * Minimaler classNames-Helfer (kein externes Paket nötig).
 * Filtert falsy-Werte und fügt die restlichen Klassen mit Leerzeichen zusammen.
 */
export type ClassValue = string | number | false | null | undefined;

export function clsx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
