import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateUniqueCode } from '@/lib/codes';
import { codeToEmail } from '@/lib/constants';

export const runtime = 'nodejs';

/** Liest das Bearer-Token aus dem Authorization-Header. */
function getBearer(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Optionales Geburtsdatum prüfen: YYYY-MM-DD, gültig, nicht in der Zukunft. */
function parseBirthDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || t > Date.now()) return null;
  return s;
}

/**
 * POST /api/athletes  — legt einen Athleten an (NUR Coach).
 * Body: { full_name, position?, sport? }
 * Antwort: { athlete, code }  (Code dem Athleten weitergeben)
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1) Aufrufer verifizieren (JWT) und Coach-Rolle prüfen.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', userData.user.id)
    .single();
  if (callerProfile?.role !== 'coach') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 2) Eingaben prüfen.
  const body = (await req.json().catch(() => null)) as {
    full_name?: unknown;
    position?: unknown;
    sport?: unknown;
    birth_date?: unknown;
  } | null;

  const fullName = String(body?.full_name ?? '').trim();
  if (!fullName) {
    return NextResponse.json({ error: 'full_name_required' }, { status: 400 });
  }
  const position = body?.position ? String(body.position).trim() || null : null;
  const sport = body?.sport ? String(body.sport).trim() || null : null;
  const birthDate = parseBirthDate(body?.birth_date);

  // 3) Eindeutigen Code + Auth-User anlegen.
  const code = await generateUniqueCode(admin);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: codeToEmail(code),
    password: code,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'athlete' },
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: 'auth_create_failed' }, { status: 500 });
  }

  // 4) athletes-Zeile (bei Fehler Auth-User wieder entfernen).
  const { data: athlete, error: athleteErr } = await admin
    .from('athletes')
    .insert({ code, full_name: fullName, position, sport, birth_date: birthDate })
    .select()
    .single();
  if (athleteErr || !athlete) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: 'athlete_create_failed' }, { status: 500 });
  }

  // 5) profiles-Verknüpfung (bei Fehler aufräumen).
  const { error: profileErr } = await admin.from('profiles').insert({
    user_id: created.user.id,
    athlete_id: athlete.id,
    role: 'athlete',
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from('athletes').delete().eq('id', athlete.id);
    return NextResponse.json({ error: 'profile_create_failed' }, { status: 500 });
  }

  return NextResponse.json({ athlete, code }, { status: 201 });
}
