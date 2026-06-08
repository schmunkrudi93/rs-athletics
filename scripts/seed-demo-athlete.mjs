#!/usr/bin/env node
/**
 * Legt einen Demo-Athleten mit realistischen Sprint-/Sprung-Werten an,
 * damit die Athleten-Ansicht (Checkpoint 2) sofort etwas zeigt.
 *
 *   node scripts/seed-demo-athlete.mjs            -> Code 424242
 *   node scripts/seed-demo-athlete.mjs 246810     -> eigener Code
 *
 * Re-runnable: ein vorhandener Demo-Athlet wird vorher entfernt.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DOMAIN = 'rs-athletics.local';
const DEMO_NAME = 'Demo Athlet';

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
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SECRET) {
  console.error('❌ .env.local unvollständig (URL / service_role).');
  process.exit(1);
}

const code = process.argv[2] ?? '424242';
if (!/^\d{6}$/.test(code)) {
  console.error('❌ Der Code muss genau 6 Ziffern haben.');
  process.exit(1);
}

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

// Messreihen: [metric_key, einheit-egal, [ [tageZurück, wert, quelle], ... ]]
const SERIES = {
  sprint_10m: [[150, 1.86, 'coach'], [110, 1.84, 'coach'], [70, 1.83, 'athlete'], [35, 1.80, 'coach'], [7, 1.78, 'coach']],
  sprint_20m: [[150, 3.12, 'coach'], [110, 3.08, 'coach'], [70, 3.04, 'coach'], [35, 3.01, 'coach'], [7, 2.98, 'coach']],
  sprint_30m: [[150, 4.34, 'coach'], [110, 4.28, 'coach'], [70, 4.22, 'coach'], [35, 4.18, 'coach'], [7, 4.15, 'coach']],
  vmax: [[150, 8.6, 'coach'], [110, 8.8, 'coach'], [70, 8.95, 'coach'], [35, 9.1, 'coach'], [7, 9.25, 'coach']],
  broad_jump: [[140, 232, 'coach'], [100, 238, 'athlete'], [60, 244, 'coach'], [20, 249, 'coach']],
  cmj_myjump: [[140, 38.5, 'athlete'], [100, 40.2, 'athlete'], [60, 42.0, 'coach'], [20, 43.6, 'coach']],
};

async function removeExistingDemo() {
  // Auth-User mit Demo-Email löschen (cascade profiles).
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email === `${code}@${DOMAIN}`) {
      try { await admin.auth.admin.deleteUser(u.id); } catch { /* egal */ }
    }
  }
  // Athleten-Zeilen mit Demo-Namen löschen (cascade measurements/profiles).
  await admin.from('athletes').delete().eq('full_name', DEMO_NAME);
}

async function main() {
  console.log('🌱 Demo-Athlet wird angelegt …');
  await removeExistingDemo();

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: `${code}@${DOMAIN}`, password: code, email_confirm: true,
    user_metadata: { role: 'athlete', demo: true },
  });
  if (cErr) { console.error(`❌ createUser: ${cErr.message}`); process.exit(1); }

  const { data: athlete, error: aErr } = await admin.from('athletes')
    .insert({ code, full_name: DEMO_NAME, position: 'Flügel', sport: 'Fußball' })
    .select().single();
  if (aErr) { console.error(`❌ athletes insert: ${aErr.message}`); process.exit(1); }

  await admin.from('profiles').insert({ user_id: created.user.id, athlete_id: athlete.id, role: 'athlete' });

  const { data: metrics } = await admin.from('metrics').select('id, key');
  const byKey = new Map((metrics ?? []).map((m) => [m.key, m.id]));

  const rows = [];
  for (const [key, points] of Object.entries(SERIES)) {
    const metricId = byKey.get(key);
    if (!metricId) continue;
    for (const [d, value, by] of points) {
      rows.push({ athlete_id: athlete.id, metric_id: metricId, value, tested_at: daysAgo(d), entered_by: by });
    }
  }
  const { error: msErr } = await admin.from('measurements').insert(rows);
  if (msErr) { console.error(`❌ measurements insert: ${msErr.message}`); process.exit(1); }

  console.log('\n✅ Demo-Athlet angelegt.');
  console.log('────────────────────────────');
  console.log(`   ATHLETEN-CODE:  ${code}`);
  console.log(`   Name:           ${DEMO_NAME}`);
  console.log(`   Messwerte:      ${rows.length}`);
  console.log('────────────────────────────\n');
}

main();
