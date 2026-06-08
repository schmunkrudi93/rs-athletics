import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { CODE_LENGTH } from '@/lib/constants';

/**
 * Erzeugt einen zufälligen Zahlencode (führende Nullen erlaubt).
 * Nutzt Web-Crypto (in Node 24 & Browser verfügbar).
 */
export function randomCode(length: number = CODE_LENGTH): string {
  const max = 10 ** length;
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % max).padStart(length, '0');
}

/**
 * Erzeugt einen Code, der noch nicht in athletes.code existiert.
 * Erwartet einen Client mit ausreichend Rechten (service_role).
 */
export async function generateUniqueCode(
  admin: SupabaseClient<Database>,
  length: number = CODE_LENGTH,
): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = randomCode(length);
    const { data, error } = await admin
      .from('athletes')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error('Konnte keinen freien Code erzeugen — bitte erneut versuchen.');
}
