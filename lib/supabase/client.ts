import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Supabase-Client für den Browser (öffentlicher anon-Key).
 * Session wird in localStorage gehalten -> Gerät bleibt eingeloggt.
 * Singleton, damit nur eine GoTrue-Instanz existiert.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase-Konfiguration fehlt: NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY müssen gesetzt sein.',
    );
  }

  browserClient = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Codes/Sessions niemals über die URL übergeben.
      detectSessionInUrl: false,
      storageKey: 'rs-athletics-auth',
    },
  });

  return browserClient;
}
