#!/usr/bin/env node
/**
 * Sicherheits- & Schema-Check gegen die echte Supabase-DB.
 *
 *   npm run check-security
 *
 * Prüft:
 *  1) Schema/Seed vorhanden (4 Tabellen, 9 Metriken)
 *  2) anon-Key kann KEINE Tabelle direkt lesen (RLS greift)
 *  3) Athlet A sieht NICHT die Messwerte von Athlet B
 *
 * Legt dafür kurz zwei Test-Athleten an und räumt sie wieder weg.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DOMAIN = 'rs-athletics.local';
const TABLES = ['athletes', 'metrics', 'measurements', 'profiles'];

function loadEnvLocal() {
  const file = `${process.cwd()}/.env.local`;
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !PUB || !SECRET) {
  console.error('❌ .env.local unvollständig (URL / anon / service_role).');
  process.exit(1);
}

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const randomCode = () => String(new Uint32Array(crypto.getRandomValues(new Uint32Array(1)))[0] % 1_000_000).padStart(6, '0');

let pass = true;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { pass = false; console.log(`  ❌ ${m}`); };

async function checkSchema() {
  console.log('\n1) Schema & Seed');
  for (const t of TABLES) {
    const { error } = await admin.from(t).select('*', { head: true, count: 'exact' });
    if (error) bad(`Tabelle "${t}" nicht lesbar (admin): ${error.message}`);
    else ok(`Tabelle "${t}" vorhanden`);
  }
  const { count, error } = await admin.from('metrics').select('*', { head: true, count: 'exact' });
  if (error) bad(`metrics-Zählung fehlgeschlagen: ${error.message}`);
  else if (count === 9) ok(`metrics-Seed: ${count} Einträge`);
  else bad(`metrics-Seed: erwartet 9, gefunden ${count}`);
}

async function checkAnonBlocked() {
  console.log('\n2) anon-Key direkt blockiert');
  const anon = createClient(URL, PUB, { auth: { persistSession: false } });
  for (const t of TABLES) {
    const { data, error } = await anon.from(t).select('*').limit(1);
    if (error || !data || data.length === 0) ok(`"${t}" für anon nicht lesbar`);
    else bad(`"${t}" liefert anon ${data.length} Zeile(n) — RLS-Leck!`);
  }
}

async function purgeTestData() {
  // Test-Auth-User (user_metadata.test === true) löschen -> cascade profiles.
  try {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.user_metadata?.test) {
        try { await admin.auth.admin.deleteUser(u.id); } catch { /* egal */ }
      }
    }
  } catch { /* egal */ }
  // Verwaiste Test-Athleten -> cascade measurements/profiles.
  try { await admin.from('athletes').delete().like('full_name', 'ZZ_TEST_%'); } catch { /* egal */ }
}

async function makeAthlete(label, value) {
  const code = randomCode();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: `${code}@${DOMAIN}`, password: code, email_confirm: true,
    user_metadata: { role: 'athlete', test: true },
  });
  if (cErr) throw new Error(`createUser (${label}): ${cErr.message}`);
  const { data: athlete, error: aErr } = await admin.from('athletes')
    .insert({ code, full_name: `ZZ_TEST_${label}` }).select().single();
  if (aErr) throw new Error(`athletes insert (${label}): ${aErr.message}`);
  await admin.from('profiles').insert({ user_id: created.user.id, athlete_id: athlete.id, role: 'athlete' });
  const { data: metric } = await admin.from('metrics').select('id').eq('key', 'sprint_10m').single();
  await admin.from('measurements').insert({ athlete_id: athlete.id, metric_id: metric.id, value, entered_by: 'coach' });
  return { code, userId: created.user.id, athleteId: athlete.id };
}

async function checkIsolation() {
  console.log('\n3) Athlet A sieht Athlet B nicht');
  await purgeTestData(); // Reste aus früheren Läufen entfernen
  let A, B;
  try {
    A = await makeAthlete('A', 1.81);
    B = await makeAthlete('B', 1.95);

    const aClient = createClient(URL, PUB, { auth: { persistSession: false } });
    const { error: signErr } = await aClient.auth.signInWithPassword({ email: `${A.code}@${DOMAIN}`, password: A.code });
    if (signErr) { bad(`Login als Athlet A fehlgeschlagen: ${signErr.message}`); return; }
    ok('Login als Athlet A per Code erfolgreich');

    const { data: visible } = await aClient.from('measurements').select('athlete_id, value');
    const seesOwn = visible?.some((r) => r.athlete_id === A.athleteId);
    const seesOther = visible?.some((r) => r.athlete_id === B.athleteId);
    if (seesOwn) ok('Athlet A sieht eigene Messwerte'); else bad('Athlet A sieht eigene Werte NICHT');
    if (!seesOther) ok('Athlet A sieht KEINE Werte von Athlet B'); else bad('Athlet A sieht Werte von B — RLS-Leck!');

    const { data: targeted } = await aClient.from('measurements').select('*').eq('athlete_id', B.athleteId);
    if (!targeted || targeted.length === 0) ok('Gezielte Abfrage auf B liefert nichts'); else bad('Gezielte Abfrage auf B liefert Daten — RLS-Leck!');

    const { data: roster } = await aClient.from('athletes').select('id');
    if ((roster?.length ?? 0) <= 1) ok('Athlet A sieht keine fremden Athleten-Profile'); else bad(`Athlet A sieht ${roster.length} Athleten — RLS-Leck!`);
  } finally {
    void A; void B;
    await purgeTestData();
    console.log('  🧹 Test-Athleten wieder entfernt');
  }
}

async function checkCoach(code) {
  console.log('\n4) Coach sieht alle Athleten');
  await purgeTestData();
  let T;
  try {
    T = await makeAthlete('COACH', 2.05);
    const c = createClient(URL, PUB, { auth: { persistSession: false } });
    const { data: signin, error: signErr } = await c.auth.signInWithPassword({ email: `${code}@${DOMAIN}`, password: code });
    if (signErr) { bad(`Coach-Login fehlgeschlagen: ${signErr.message}`); return; }
    ok('Coach-Login per Code erfolgreich');
    const { data: prof } = await c.from('profiles').select('role').eq('user_id', signin.user.id).single();
    if (prof?.role === 'coach') ok("Rolle = 'coach'"); else bad(`Rolle erwartet 'coach', war '${prof?.role}'`);
    const { data: roster } = await c.from('athletes').select('id');
    if ((roster?.length ?? 0) >= 1) ok(`Coach sieht Athleten-Roster (${roster.length})`); else bad('Coach sieht keine Athleten');
    const { data: ms } = await c.from('measurements').select('id').eq('athlete_id', T.athleteId);
    if ((ms?.length ?? 0) >= 1) ok('Coach sieht fremde Messwerte'); else bad('Coach sieht fremde Messwerte NICHT');
  } finally {
    void T;
    await purgeTestData();
    console.log('  🧹 Test-Athlet wieder entfernt');
  }
}

(async () => {
  console.log('🔍 RS Athletics — Sicherheits-Check');
  await checkSchema();
  await checkAnonBlocked();
  await checkIsolation();
  const coachCode = process.argv[2];
  if (coachCode && /^\d{6}$/.test(coachCode)) await checkCoach(coachCode);
  console.log(`\n${pass ? '✅ ALLES BESTANDEN' : '❌ ES GIBT PROBLEME — siehe oben'}\n`);
  process.exit(pass ? 0 : 1);
})();
