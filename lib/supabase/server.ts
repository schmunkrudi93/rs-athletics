import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

function requireUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL fehlt.');
  return url;
}

/**
 * Admin-Client mit Service-Role-Key. NUR serverseitig verwenden!
 * Umgeht RLS — für Athlet-/Coach-Anlegen und privilegierte Lesezugriffe.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY fehlt (nur serverseitig setzen, niemals als NEXT_PUBLIC).',
    );
  }
  return createClient<Database>(requireUrl(), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Anon-Client für serverseitige Login-Versuche (über die Rate-Limit-Route).
 * Hält keine Session — die Tokens gehen an den Client zurück.
 */
export function createServerAnonClient(): SupabaseClient<Database> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.');
  return createClient<Database>(requireUrl(), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
