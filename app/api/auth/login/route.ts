import { NextResponse } from 'next/server';
import { createServerAnonClient } from '@/lib/supabase/server';
import { codeToEmail, isValidCode } from '@/lib/constants';
import { rateLimit, resetRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = rateLimit(`login:${ip}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: Math.ceil(limited.retryAfterMs / 1000) },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const code = String((body as { code?: unknown })?.code ?? '');
  if (!isValidCode(code)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }

  const supabase = createServerAnonClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: codeToEmail(code),
    password: code,
  });

  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  // Profil/Rolle mit der frisch erhaltenen Session lesen (RLS erlaubt eigenes Profil).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, athlete_id')
    .eq('user_id', data.user.id)
    .single();

  resetRateLimit(`login:${ip}`);

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    role: profile?.role ?? 'athlete',
    athlete_id: profile?.athlete_id ?? null,
  });
}
