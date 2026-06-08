# RS Athletics — Speed & Strength Coaching

> Train Fast. Play Faster.

Mobile-first PWA zum Tracken von Athletik-Leistungsdaten. Athleten sehen und
pflegen ihre eigenen Werte über einen 6-stelligen Zahlencode; der Coach sieht
alle Athleten und kann Werte eintragen — inkl. Batch-„Testing-Modus".

Dieses Repo befindet sich nach **Checkpoint 1**: Grundgerüst, Datenbankschema,
RLS und Auth-Mechanik stehen. Login-Screen und Dashboards folgen.

---

## Tech-Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS** (dunkles Theme)
- **Supabase** (Postgres + Auth + Auto-API) mit **Row Level Security**
- **Recharts** (Verlaufs-Graphen — ab Checkpoint 2)
- **PWA**: Web-App-Manifest + Service Worker (installierbar auf iOS & Android)
- Hosting auf **Vercel**

---

## Schnellstart (lokal)

### 1. Voraussetzungen

- Node.js ≥ 18 (getestet mit Node 24)
- Ein kostenloses [Supabase](https://supabase.com)-Projekt
- (für Deploy) ein [Vercel](https://vercel.com)-Account

### 2. Abhängigkeiten installieren

```bash
npm install
```

> Falls `npm install` mit `EACCES`/`EEXIST` im npm-Cache abbricht, hilft ein
> frischer Cache: `npm install --cache /tmp/npm-cache`.

### 3. Supabase-Projekt einrichten

1. Neues Projekt auf supabase.com anlegen.
2. Im **SQL-Editor** den **kompletten Inhalt von [`supabase/schema.sql`](supabase/schema.sql)**
   einfügen und ausführen. Das legt Tabellen, Indizes, RLS-Policies,
   Hilfsfunktionen und den v1-Seed (Sprint + Sprung) an. Die Datei ist
   idempotent — erneutes Ausführen ist gefahrlos.

### 4. Supabase-Auth härten (wichtig)

Im Dashboard unter **Authentication → Providers / Settings**:

- **Public Sign-ups deaktivieren** („Allow new users to sign up" aus).
  Nutzer werden ausschließlich serverseitig (Service-Role) angelegt — die
  Admin-API umgeht diese Sperre, öffentliche Selbstregistrierung wird so
  unterbunden.
- **Kein SMTP nötig.** Wir versenden keine E-Mails: Accounts werden per
  Admin-API mit `email_confirm: true` (vorbestätigt) erstellt.
- Optional: unter **Rate Limits** die Token-/Sign-in-Limits prüfen
  (zusätzlicher netzwerkweiter Brute-Force-Schutz).

### 5. `.env.local` anlegen

`.env.example` nach `.env.local` kopieren und ausfüllen
(Werte findest du in Supabase unter **Project Settings → API**):

```bash
cp .env.example .env.local
```

| Variable | Sichtbarkeit | Zweck |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | öffentlich | Projekt-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | öffentlich | Anon-Public-Key (Browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | **nur Server** | Athlet-/Coach-Anlegen (Admin-API) |

> ⚠️ Der **Service-Role-Key** darf **niemals** mit `NEXT_PUBLIC_` geprefixt
> oder im Frontend verwendet werden. Er steht nur in `.env.local` (gitignored)
> bzw. in den Vercel-Env-Variablen.

### 6. Coach-Account anlegen (einmalig)

```bash
npm run create-coach            # zufälliger Coach-Code
# oder
npm run create-coach -- 246810  # eigener Coach-Code
```

Der Befehl gibt den **Coach-Code** aus. Mit diesem Code meldest du dich später
als Coach an. Der Code ist das Passwort des Coach-Auth-Users und wird von
Supabase **gehasht** gespeichert — nirgends im Klartext.

### 7. Dev-Server starten

```bash
npm run dev
```

→ http://localhost:3000

---

## Zugang & Sicherheit

Der Zahlencode ist ein **niedrigschwelliger Zugang**, kein hochsicheres Login —
passend zur geringen Sensibilität der Daten. Trotzdem ist Datentrennung **auf
Datenbankebene** erzwungen:

- **Auth über Code:** Jeder Athlet (und der Coach) ist ein Supabase-Auth-User
  mit E-Mail `{code}@rs-athletics.local` und dem Code als Passwort. Die App
  setzt den eingetippten Code intern in E-Mail+Passwort um und meldet an.
  Supabase verwaltet Session/JWT; die Session liegt im `localStorage`
  (Gerät bleibt eingeloggt, „Abmelden / Athlet wechseln" möglich).
- **Rollen:** Tabelle `profiles (user_id, athlete_id, role)` verknüpft
  Auth-User → Athlet und hält die Rolle (`athlete` | `coach`).
- **Coach-Code serverseitig:** Der Coach-Code ist das (gehashte) Passwort des
  Coach-Auth-Users — **keine** `NEXT_PUBLIC`-Variable, kein Klartext in der DB.
- **RLS auf allen Tabellen:** `anon` ist komplett ausgesperrt; `authenticated`
  greift nur über Policies. Athlet sieht/bearbeitet **ausschließlich eigene**
  `measurements`; Coach darf alles. Durchgesetzt via `auth.uid()` und den
  `SECURITY DEFINER`-Funktionen `is_coach()` / `current_athlete_id()`.
- **Athleten anlegen** nur über die Server-Route `POST /api/athletes`
  (Service-Role), die zuerst per Bearer-Token die Coach-Rolle prüft und einen
  eindeutigen 6-stelligen Code generiert.
- **Rate-Limiting:** Die Login-Route `POST /api/auth/login` drosselt Versuche
  pro IP (In-Memory, best-effort) — ergänzt durch Supabase-Auth-Rate-Limits.
- **Codes nie in der URL** (`detectSessionInUrl: false`).

> **Warum dieser Weg (statt Coach-Code in einer Secret-Tabelle)?** Indem der
> Coach-Code das Auth-Passwort ist, läuft der Coach-Login über denselben
> sicheren, gehashten Mechanismus wie der Athleten-Login — eine zusätzliche
> Klartext-/Secret-Ablage entfällt. Gleichwertig sicher, weniger Angriffsfläche.

Der Sicherheits-Check (anon-Key kann Tabellen nicht direkt lesen; Athlet A
sieht Athlet B nicht) wird in **Checkpoint 1** gemeinsam verifiziert.

---

## Eigenes Logo & Icons

- In v1 zeigt die App einen sauberen Text-Platzhalter („RS ATHLETICS").
- **Eigenes Logo:** Lege es als `public/logo.png` (quadratisch, idealerweise
  ≥ 512 px) ab und führe `npm run icons` aus — die PWA-/Favicon-Icons in
  `public/icons/` werden dann mit deinem Logo neu erzeugt.
- Den Wortmark im UI rendert die Komponente `components/logo.tsx` (eine Stelle,
  leicht auf `<img src="/logo.png" />` umstellbar).

---

## PWA-Installation

- **Android (Chrome):** Menü → „App installieren" / „Zum Startbildschirm".
- **iOS (Safari):** Teilen → „Zum Home-Bildschirm".
- Der Service Worker wird nur in der **Produktion** registriert
  (`npm run build && npm start` oder Vercel), nicht im Dev-Modus.

---

## Deployment auf Vercel

1. Repo zu GitHub pushen, in Vercel importieren (Framework: Next.js).
2. Unter **Settings → Environment Variables** dieselben drei Variablen wie in
   `.env.local` setzen (`SUPABASE_SERVICE_ROLE_KEY` nur als normale, **nicht**
   öffentliche Variable).
3. Deploy. In Supabase ggf. die Vercel-Domain unter
   **Authentication → URL Configuration** ergänzen.

Alles bleibt im kostenlosen Tier von Supabase + Vercel (Dutzende Athleten).

---

## Projektstruktur

```
app/
  layout.tsx          Root-Layout, Fonts, PWA-Metadaten
  page.tsx            Platzhalter-Start (Login folgt)
  globals.css         Dunkles Theme
  api/
    auth/login/       Login-Route (Rate-Limit + Code→Session)
    athletes/         Athlet anlegen (Coach-only, Service-Role)
components/           Logo, Service-Worker-Registrierung
lib/
  constants.ts        Code↔E-Mail, Kategorien, Rollen
  database.types.ts   Supabase-Typen
  supabase/           Browser- & Server-Clients
  auth-client.ts      Login/Logout/Session-Helfer (Client)
  rate-limit.ts       In-Memory-Drossel
  codes.ts            Code-Generierung
scripts/
  create-coach.mjs    Coach-Account anlegen
  generate-icons.mjs  PWA-Icons erzeugen
supabase/
  schema.sql          Migration + RLS + Seed
public/               Manifest, Service Worker, Icons
```

---

## Build-Reihenfolge (Checkpoints)

1. ✅ Setup + PWA-Grundgerüst + dunkles Theme
2. ✅ Datenbank (Migration + Seed) + RLS + Auth-Mechanik — **⏸️ Checkpoint 1**
3. ⬜ Login-Screen (numerisches Tastenfeld) + Session + Routing
4. ⬜ Athleten-Ansicht (Sprint/Sprung, Kacheln, Graph, Eintragen) — **⏸️ Checkpoint 2**
5. ⬜ Coach-Ansicht (Roster, Detail, Testing-Modus, Athlet anlegen) — **⏸️ Checkpoint 3**
6. ⬜ Polish & Deploy (Responsive, PWA-Install, Sicherheits-Check)
