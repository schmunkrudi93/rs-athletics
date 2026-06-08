import { getSupabaseClient } from '@/lib/supabase/client';
import type { Role } from '@/lib/constants';

export type Session = { role: Role; athleteId: string | null };

/** Login fehlgeschlagen (falscher Code o.ä.). */
export class InvalidCodeError extends Error {
  constructor() {
    super('Code ungültig');
    this.name = 'InvalidCodeError';
  }
}

/** Zu viele Versuche — IP/Gerät vorübergehend gesperrt. */
export class RateLimitError extends Error {
  retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super('Zu viele Versuche');
    this.name = 'RateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Meldet das Gerät über den Zahlencode an:
 * Code -> Server-Route (Rate-Limit + signIn) -> Session in localStorage setzen.
 */
export async function loginWithCode(code: string): Promise<Session> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
    throw new RateLimitError(body.retryAfterSec ?? 60);
  }
  if (!res.ok) {
    throw new InvalidCodeError();
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    role: Role;
    athlete_id: string | null;
  };

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) throw error;

  return { role: data.role, athleteId: data.athlete_id };
}

/** Aktuelle Session/Rolle aus dem gespeicherten Token ermitteln (oder null). */
export async function getActiveSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, athlete_id')
    .eq('user_id', session.user.id)
    .single();
  if (!profile) return null;

  return { role: profile.role as Role, athleteId: profile.athlete_id };
}

/** Abmelden / Athlet wechseln.
 *  scope:'local' entfernt die Session ohne Netz-Roundtrip – so kann das
 *  Abmelden nie an einer langsamen oder bereits ungültigen Verbindung hängen
 *  bleiben. Fehler werden geschluckt: lokal ist man danach in jedem Fall ab. */
export async function logout(): Promise<void> {
  try {
    await getSupabaseClient().auth.signOut({ scope: 'local' });
  } catch {
    // Session evtl. serverseitig schon ungültig — lokal trotzdem abgemeldet.
  }
}
