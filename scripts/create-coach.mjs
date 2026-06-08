#!/usr/bin/env node
/**
 * Legt EINMALIG einen Coach-Account an.
 *
 *   npm run create-coach            -> zufälliger 6-stelliger Coach-Code
 *   npm run create-coach -- 246810  -> eigener Coach-Code
 *
 * Liest NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY aus .env.local.
 * Der Coach-Code ist das Passwort des Coach-Auth-Users (von Supabase gehasht)
 * und wird nirgends im Klartext gespeichert.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const AUTH_EMAIL_DOMAIN = 'rs-athletics.local';
const CODE_LENGTH = 6;

function loadEnvLocal() {
  const file = `${process.cwd()}/.env.local`;
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

function randomCode(length = CODE_LENGTH) {
  const max = 10 ** length;
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % max).padStart(length, '0');
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail(
    'NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen in .env.local stehen.',
  );
}

const desired = process.argv[2];
if (desired && !/^\d{6}$/.test(desired)) {
  fail('Der Coach-Code muss genau 6 Ziffern haben.');
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function createCoach() {
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = desired ?? randomCode();
    const email = `${code}@${AUTH_EMAIL_DOMAIN}`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: code,
      email_confirm: true,
      user_metadata: { role: 'coach' },
    });

    if (createErr) {
      // Code/E-Mail schon vergeben -> bei Zufallscode neu versuchen.
      if (!desired && /already|registered|exists|duplicate/i.test(createErr.message)) {
        continue;
      }
      fail(`Auth-User konnte nicht angelegt werden: ${createErr.message}`);
    }

    const { error: profileErr } = await admin.from('profiles').insert({
      user_id: created.user.id,
      athlete_id: null,
      role: 'coach',
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      fail(`Profil konnte nicht angelegt werden: ${profileErr.message}`);
    }

    console.log('\n✅ Coach-Account angelegt.');
    console.log('────────────────────────────');
    console.log(`   COACH-CODE:  ${code}`);
    console.log('────────────────────────────');
    console.log('Mit diesem Code meldest du dich als Coach an.\n');
    return;
  }
  fail('Konnte keinen freien Coach-Code finden — bitte erneut versuchen.');
}

createCoach();
