import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { codeToEmail, isValidCode } from '@/lib/constants';

export const runtime = 'nodejs';

/** Liest das Bearer-Token aus dem Authorization-Header. */
function getBearer(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * DELETE /api/athletes/[id]  — entfernt einen Athleten endgültig (NUR Coach).
 * Löscht die athletes-Zeile (Messwerte + Profil per Cascade) und den zugehörigen
 * Auth-Login. Unwiderruflich – das UI fragt vorher nach.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'id_required' }, { status: 400 });
  }

  // 2) Verknüpfte Auth-Logins merken, BEVOR die Cascade das Profil entfernt.
  const { data: linkedProfiles } = await admin
    .from('profiles')
    .select('user_id')
    .eq('athlete_id', id);

  // 3) Athlet löschen – Messwerte und Profile hängen per ON DELETE CASCADE dran.
  const { error: delErr } = await admin.from('athletes').delete().eq('id', id);
  if (delErr) {
    return NextResponse.json({ error: 'athlete_delete_failed' }, { status: 500 });
  }

  // 4) Auth-Login(s) entfernen (best effort – der sichtbare Athlet ist bereits weg).
  for (const p of linkedProfiles ?? []) {
    if (p.user_id) await admin.auth.admin.deleteUser(p.user_id);
  }

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/athletes/[id]  — ändert den Login-Code eines Athleten (NUR Coach).
 * Der Code ist gleichzeitig E-Mail-Local-Part UND Passwort des Auth-Logins,
 * lässt sich daher nicht über RLS ändern. Wir stellen den Auth-User (service_role)
 * UND athletes.code um – schlägt der zweite Schritt fehl, rollen wir den ersten
 * zurück. Body: { code }  (6-stellig, nur Ziffern)  ->  Antwort: { athlete }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'id_required' }, { status: 400 });
  }

  // 2) Neuen Code prüfen.
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const newCode = String(body?.code ?? '').trim();
  if (!isValidCode(newCode)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }

  // 3) Aktuellen Athleten laden (alter Code dient als Rückfall).
  const { data: current, error: curErr } = await admin
    .from('athletes')
    .select('id, code')
    .eq('id', id)
    .single();
  if (curErr || !current) {
    return NextResponse.json({ error: 'athlete_not_found' }, { status: 404 });
  }

  // Kein echter Wechsel -> aktuellen Datensatz unverändert zurückgeben.
  if (current.code === newCode) {
    const { data: unchanged } = await admin.from('athletes').select().eq('id', id).single();
    return NextResponse.json({ athlete: unchanged });
  }

  // 4) Kollision verhindern: nutzt ein anderer Athlet den Code bereits?
  const { data: clash } = await admin
    .from('athletes')
    .select('id')
    .eq('code', newCode)
    .neq('id', id)
    .maybeSingle();
  if (clash) {
    return NextResponse.json({ error: 'code_taken' }, { status: 409 });
  }

  // 5) Verknüpften Auth-Login finden.
  const { data: linked } = await admin
    .from('profiles')
    .select('user_id')
    .eq('athlete_id', id)
    .maybeSingle();
  const userId = linked?.user_id;
  if (!userId) {
    return NextResponse.json({ error: 'login_not_found' }, { status: 404 });
  }

  // 6) Auth-User umstellen (E-Mail-Local-Part UND Passwort = neuer Code).
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    email: codeToEmail(newCode),
    password: newCode,
    email_confirm: true,
  });
  if (authErr) {
    return NextResponse.json({ error: 'auth_update_failed' }, { status: 500 });
  }

  // 7) athletes.code nachziehen – bei Fehler die Auth-Änderung zurückrollen.
  const { data: updated, error: updErr } = await admin
    .from('athletes')
    .update({ code: newCode })
    .eq('id', id)
    .select()
    .single();
  if (updErr || !updated) {
    await admin.auth.admin.updateUserById(userId, {
      email: codeToEmail(current.code),
      password: current.code,
      email_confirm: true,
    });
    return NextResponse.json({ error: 'athlete_update_failed' }, { status: 500 });
  }

  return NextResponse.json({ athlete: updated });
}
