-- ============================================================================
-- RS Athletics — Datenbankschema, RLS & Seed
-- ----------------------------------------------------------------------------
-- Im Supabase SQL-Editor komplett einfügen und ausführen.
-- Idempotent: kann gefahrlos erneut ausgeführt werden.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- TABELLEN
-- ----------------------------------------------------------------------------

-- ATHLETEN
create table if not exists public.athletes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,        -- 6-stelliger Zahlencode
  full_name   text not null,
  position    text,                         -- z.B. "Stürmer" (optional)
  sport       text,                         -- z.B. "Eishockey" (optional)
  birth_date  date,                          -- Geburtsdatum (optional)
  notes       text,                         -- Coach-Notizen / Bewertung
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- Nachrüstung für bestehende DBs: Geburtsdatum ergänzen (idempotent).
alter table public.athletes add column if not exists birth_date date;

-- METRIK-KATALOG: definiert, WAS getrackt werden kann
create table if not exists public.metrics (
  id               uuid primary key default gen_random_uuid(),
  key              text unique not null,    -- z.B. "sprint_10m"
  label            text not null,           -- Anzeigename, z.B. "10 m"
  category         text not null,           -- 'sprint' | 'jump' | 'strength' | 'cod' | 'custom'
  unit             text not null,           -- 's' | 'm/s' | 'cm' | 'kg' | 'reps' | ''
  higher_is_better boolean not null,        -- WICHTIG für Trend-Richtung & Farben
  sort_order       int default 0,
  is_custom        boolean default false,
  is_active        boolean not null default true,  -- false = archiviert (ausgeblendet, Daten bleiben)
  created_by       uuid references public.athletes(id) on delete set null,
  created_at       timestamptz default now()
);

-- Nachrüstung für bestehende DBs: Archiv-Flag ergänzen (idempotent).
alter table public.metrics add column if not exists is_active boolean not null default true;

-- MESSWERTE: die eigentliche Zeitreihe
create table if not exists public.measurements (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes(id) on delete cascade,
  metric_id   uuid not null references public.metrics(id),
  value       numeric not null,                     -- bei 1RM-Übungen das berechnete 1RM
  reps        int,                                  -- nur 1RM: Wiederholungen der Eingabe
  weight      numeric,                              -- nur 1RM: Last der Eingabe (kg)
  side        text check (side is null or side in ('left', 'right')),  -- nur Richtungswechsel: Seite
  tested_at   date not null default current_date,  -- Testdatum, editierbar
  entered_by  text not null default 'athlete',     -- 'athlete' | 'coach'
  note        text,
  created_at  timestamptz default now()
);

create index if not exists measurements_athlete_metric_date_idx
  on public.measurements (athlete_id, metric_id, tested_at);

-- Nachrüstung für bestehende DBs: 1RM-Herleitung (Last × Wdh.) ergänzen (idempotent).
alter table public.measurements add column if not exists reps int;
alter table public.measurements add column if not exists weight numeric;

-- Nachrüstung: Seite (links/rechts) für Richtungswechsel-Tests (5-0-5, 5-10-5, 90°, 180°).
alter table public.measurements add column if not exists side text
  check (side is null or side in ('left', 'right'));

-- PROFILES: verknüpft Supabase-Auth-User -> Athlet und hält die Rolle.
-- Coach: athlete_id IS NULL, role = 'coach'.
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  athlete_id  uuid references public.athletes(id) on delete cascade,
  role        text not null default 'athlete' check (role in ('athlete', 'coach')),
  created_at  timestamptz default now()
);

create index if not exists profiles_athlete_id_idx on public.profiles (athlete_id);

-- ----------------------------------------------------------------------------
-- HILFSFUNKTIONEN (SECURITY DEFINER -> lesen profiles ohne RLS-Rekursion)
-- ----------------------------------------------------------------------------

create or replace function public.is_coach()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'coach'
  );
$$;

create or replace function public.current_athlete_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select athlete_id from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- RECHTE: anon komplett aussperren, authenticated über RLS steuern.
-- (service_role hat bypassrls und ist davon nicht betroffen.)
-- ----------------------------------------------------------------------------

revoke all on table public.athletes    from anon;
revoke all on table public.metrics     from anon;
revoke all on table public.measurements from anon;
revoke all on table public.profiles    from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.athletes     to authenticated;
grant select, insert, update, delete on table public.metrics      to authenticated;
grant select, insert, update, delete on table public.measurements to authenticated;
grant select, insert, update, delete on table public.profiles     to authenticated;

revoke all on function public.is_coach()            from public;
revoke all on function public.current_athlete_id()  from public;
grant execute on function public.is_coach()           to authenticated;
grant execute on function public.current_athlete_id() to authenticated;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table public.athletes     enable row level security;
alter table public.metrics      enable row level security;
alter table public.measurements enable row level security;
alter table public.profiles     enable row level security;

-- ---- ATHLETES -------------------------------------------------------------
drop policy if exists athletes_select on public.athletes;
create policy athletes_select on public.athletes
  for select to authenticated
  using (public.is_coach() or id = public.current_athlete_id());

-- Nur Coach darf Athleten anlegen/ändern/löschen (Anlegen sonst via service_role).
drop policy if exists athletes_write on public.athletes;
create policy athletes_write on public.athletes
  for all to authenticated
  using (public.is_coach())
  with check (public.is_coach());

-- ---- METRICS --------------------------------------------------------------
-- Katalog für alle eingeloggten Nutzer lesbar.
drop policy if exists metrics_select on public.metrics;
create policy metrics_select on public.metrics
  for select to authenticated
  using (true);

-- Schreiben in v1 nur Coach (eigene Übungen von Athleten = späteres Feature).
drop policy if exists metrics_write on public.metrics;
create policy metrics_write on public.metrics
  for all to authenticated
  using (public.is_coach())
  with check (public.is_coach());

-- ---- MEASUREMENTS (der sensible Teil) -------------------------------------
drop policy if exists measurements_select on public.measurements;
create policy measurements_select on public.measurements
  for select to authenticated
  using (public.is_coach() or athlete_id = public.current_athlete_id());

-- Einfügen: Coach für alle (entered_by='coach'); Athlet nur für sich selbst
-- und nur als entered_by='athlete' (kein Spoofing von Coach-Einträgen).
drop policy if exists measurements_insert on public.measurements;
create policy measurements_insert on public.measurements
  for insert to authenticated
  with check (
    public.is_coach()
    or (athlete_id = public.current_athlete_id() and entered_by = 'athlete')
  );

-- Ändern/Löschen: Coach alles; Athlet nur EIGENE, selbst erfasste Werte
-- (entered_by='athlete'). Coach-Einträge sind für den Athleten unantastbar –
-- spiegelt die Insert-Regel und verhindert Manipulation offizieller Tests.
drop policy if exists measurements_update on public.measurements;
create policy measurements_update on public.measurements
  for update to authenticated
  using (
    public.is_coach()
    or (athlete_id = public.current_athlete_id() and entered_by = 'athlete')
  )
  with check (
    public.is_coach()
    or (athlete_id = public.current_athlete_id() and entered_by = 'athlete')
  );

drop policy if exists measurements_delete on public.measurements;
create policy measurements_delete on public.measurements
  for delete to authenticated
  using (
    public.is_coach()
    or (athlete_id = public.current_athlete_id() and entered_by = 'athlete')
  );

-- ---- PROFILES -------------------------------------------------------------
-- Eigenes Profil lesbar (für Rollen-Lookup nach Login); Coach sieht alle.
-- Schreiben passiert ausschließlich via service_role (Server-Routen).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_coach());

-- ----------------------------------------------------------------------------
-- SEED v1: Sprint + Sprung
-- ----------------------------------------------------------------------------
insert into public.metrics (key, label, category, unit, higher_is_better, sort_order) values
  -- SPRINT
  ('sprint_10m','10 m','sprint','s',false,10),
  ('sprint_20m','20 m','sprint','s',false,20),
  ('sprint_30m','30 m','sprint','s',false,30),
  ('vmax','Max. Geschwindigkeit','sprint','m/s',true,40),
  ('fly_10m','10 m Fly','sprint','s',false,50),
  -- SPRUNG
  ('broad_jump','Broad Jump','jump','cm',true,10),
  ('cmj_myjump','CMJ (My Jump)','jump','cm',true,20),
  ('cmj_forceplate','CMJ (Kraftmessplatte)','jump','cm',true,30),
  ('rsi','Reactive Strength Index','jump','',true,40)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- SEED v2: Kraft, Richtungswechsel (COD) & Ausdauer
-- Standard-Tests (is_custom=false -> nur archivierbar, nicht löschbar).
-- ----------------------------------------------------------------------------
insert into public.metrics (key, label, category, unit, higher_is_better, sort_order) values
  -- KRAFT
  ('squat_1rm','Kniebeuge 1RM','strength','kg',true,10),
  ('bench_1rm','Bankdrücken 1RM','strength','kg',true,20),
  ('pullups','Klimmzüge','strength','reps',true,30),
  ('pullup_1rm','Klimmzüge (1RM)','strength','kg',true,40),
  ('trapbar_1rm','Trap Bar (1RM)','strength','kg',true,50),
  -- RICHTUNGSWECHSEL / GAMES SPEED (5-10-Familie; 'Linear' = Referenz für Deficit)
  ('5_10_linear','5-10 Linear','cod','s',false,10),
  ('5_10_90','5-10 90°','cod','s',false,20),
  ('5_10_180','5-10 180°','cod','s',false,30),
  -- AUSDAUER
  ('30_15_ift','30-15 IFT','endurance','km/h',true,10)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- SEED v3: RSA (Repeated Sprint Ability)
-- Mehrwert-Test: pro Test-Session werden MEHRERE Sprintzeiten als einzelne
-- measurements (gleiches tested_at) gespeichert. Das Frontend erkennt RSA am
-- key-Präfix 'rsa_' und wertet Ermüdung/Fatigue aus. unit='s', niedriger=besser.
-- Label frei änderbar; key NICHT ändern (Frontend-Erkennung).
-- ----------------------------------------------------------------------------
insert into public.metrics (key, label, category, unit, higher_is_better, sort_order) values
  ('rsa_6_30_180','RSA 6×30 m (180°)','endurance','s',false,20)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- SEED v4: Richtungswechsel (COD) – klassische Agility-Tests
-- 5-0-5 und 5-10-5 (Pro Agility) erscheinen als Kacheln im cod-Reiter; die
-- 5-10-Familie (Linear/90°/180°) bleibt cod, wird aber im Frontend gebündelt
-- als „Games Speed"-Abschnitt (Defizit) gezeigt. unit='s', niedriger=besser.
-- ----------------------------------------------------------------------------
insert into public.metrics (key, label, category, unit, higher_is_better, sort_order) values
  ('5_0_5','5-0-5','cod','s',false,5),
  ('pro_agility','5-10-5 (Pro Agility)','cod','s',false,6)
on conflict (key) do nothing;
