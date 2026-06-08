'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { todayISO } from '@/lib/format';
import type { AthleteRow } from '@/lib/database.types';

const FIELD =
  'h-11 w-full rounded-xl border border-line bg-surface px-3 text-foreground placeholder:text-foreground-subtle focus:border-accent';
const LABEL = 'text-xs font-medium text-foreground-muted';

/** Fehlercodes der Route -> verständliche Meldung. */
const ERRORS: Record<string, string> = {
  full_name_required: 'Bitte einen Namen eingeben.',
  unauthorized: 'Sitzung abgelaufen — bitte neu anmelden.',
  forbidden: 'Nur der Coach darf Athleten anlegen.',
  auth_create_failed: 'Zugang konnte nicht angelegt werden. Bitte erneut versuchen.',
  athlete_create_failed: 'Athlet konnte nicht angelegt werden. Bitte erneut versuchen.',
  profile_create_failed: 'Profil konnte nicht verknüpft werden. Bitte erneut versuchen.',
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Roster nach erfolgreichem Anlegen neu laden. */
  onCreated: () => void;
};

export function AthleteCreateDialog({ open, onClose, onCreated }: Props) {
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [sport, setSport] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ athlete: AthleteRow; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Beim Öffnen alles zurücksetzen.
  useEffect(() => {
    if (!open) return;
    setFullName('');
    setPosition('');
    setSport('');
    setBirthDate('');
    setSaving(false);
    setError(null);
    setCreated(null);
    setCopied(false);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = fullName.trim();
    if (!name) {
      setError('Bitte einen Namen eingeben.');
      return;
    }

    setSaving(true);
    setError(null);

    // Coach-Token aus der aktuellen Session für die geschützte Route.
    const supabase = getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setSaving(false);
      setError('Sitzung abgelaufen — bitte neu anmelden.');
      return;
    }

    const res = await fetch('/api/athletes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        full_name: name,
        position: position.trim() || undefined,
        sport: sport.trim() || undefined,
        birth_date: birthDate || undefined,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setSaving(false);
      setError(ERRORS[body.error ?? ''] ?? 'Anlegen fehlgeschlagen. Bitte erneut versuchen.');
      return;
    }

    const data = (await res.json()) as { athlete: AthleteRow; code: string };
    setSaving(false);
    setCreated(data);
    onCreated();
  }

  async function copyCode() {
    if (!created || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard evtl. nicht verfügbar (z. B. ohne HTTPS) — Code steht sichtbar da.
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={created ? 'Athlet angelegt' : 'Neuer Athlet'}>
      {created ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground-muted">
            <span className="font-medium text-foreground">{created.athlete.full_name}</span> ist
            angelegt. Dieser Code ist das Login — gib ihn dem Athleten:
          </p>

          <div className="flex flex-col items-center gap-1 rounded-xl bg-surface-muted px-4 py-5">
            <span className="font-mono text-3xl font-bold tracking-[0.3em] text-foreground">
              {created.code}
            </span>
            <span className="text-xs text-foreground-subtle">Login-Code</span>
          </div>

          <p className="text-xs text-foreground-subtle">
            Du findest den Code später jederzeit in der Athletenliste wieder.
          </p>

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={copyCode}>
              {copied ? 'Kopiert ✓' : 'Code kopieren'}
            </Button>
            <Button type="button" onClick={onClose}>
              Fertig
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL} htmlFor="ac-name">
              Name
            </label>
            <input
              id="ac-name"
              type="text"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="z. B. Lena Vogt"
              className={FIELD}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={LABEL} htmlFor="ac-pos">
              Position (optional)
            </label>
            <input
              id="ac-pos"
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="z. B. Außenbahn"
              className={FIELD}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={LABEL} htmlFor="ac-sport">
              Sportart (optional)
            </label>
            <input
              id="ac-sport"
              type="text"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              placeholder="z. B. Leichtathletik"
              className={FIELD}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={LABEL} htmlFor="ac-birth">
              Geburtsdatum (optional)
            </label>
            <input
              id="ac-birth"
              type="date"
              value={birthDate}
              max={todayISO()}
              onChange={(e) => setBirthDate(e.target.value)}
              className={FIELD}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Anlegen …' : 'Anlegen'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
