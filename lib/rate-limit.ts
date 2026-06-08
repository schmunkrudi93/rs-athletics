/**
 * Einfacher In-Memory-Rate-Limiter (Sliding Window) als Brute-Force-Bremse
 * für die Login-Route. Best-effort: pro Serverless-Instanz eigener Speicher.
 * Die maßgebliche netzwerkweite Drossel liefert zusätzlich Supabase Auth selbst
 * (Dashboard -> Authentication -> Rate Limits).
 */

const hits = new Map<string, number[]>();

export type RateResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function rateLimit(
  key: string,
  opts?: { max?: number; windowMs?: number },
): RateResult {
  const max = opts?.max ?? 10;
  const windowMs = opts?.windowMs ?? 15 * 60 * 1000;
  const now = Date.now();

  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    hits.set(key, recent);
    const retryAfterMs = windowMs - (now - recent[0]);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  recent.push(now);
  hits.set(key, recent);
  return { allowed: true, remaining: max - recent.length, retryAfterMs: 0 };
}

/** Nach erfolgreichem Login das Konto/IP wieder freigeben. */
export function resetRateLimit(key: string): void {
  hits.delete(key);
}
