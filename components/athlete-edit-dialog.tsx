'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { todayISO } from '@/lib/format';
import { isValidCode } from '@/lib/constants';
import { randomCode } from '@/lib/codes';
import type { AthleteRow } from '@/lib/database.types';

const FIELD =
  'h-11 w-full rounded-xl border border-line bg-surface px-3 text-foreground placeholder:text-foreground-subtle focus:border-accent';
const LABEL = 'text-xs font-medium text-foreground-muted';

/** Fehlercodes der Code-Route -> verständliche Meldung. */
const CODE_ERRORS: Record<string, string> = {
  invalid_code: 'Der Login-Code muss aus 6 Ziffern bestehen.',
  code_taken: 'Dieser Code ist bereits vergeben. Bitte einen anderen wählen.',
  unauthorized: 'Sitzung abgelaufen — bitte neu anmelden.',
  forbidden: 'Nur der Coach darf den Code ändern.',
  athlete_not_found: 'Athlet nicht gefunden.',
  login_not_found: 'Zu diesem Athleten gibt es keinen Login.',
  auth_update_failed: 'Login konnte nicht aktualisiert werden. Bitte erneut versuchen.',
  athlete_update_failed: 'Code konnte nicht gespeichert werden. Bitte erneut versuchen.',
};

type Props = {
  open: boolean;
  onClose: () => void;
  athlete: AthleteRow | null;
  /** Aktualisierten Datensatz zurückgeben (für Kopf/Verwaltung/Reload). */
  onSaved: (updated: AthleteRow) => void;
};

/** Stammdaten eines Athleten korrigieren (Name/Position/Sportart/Geburtsdatum/Notiz)
 *  und den Login-Code ändern. Der Code IST das Login – seine Änderung läuft daher
 *  über die geschützte Server-Route (service_role), alles Übrige via RLS-Client. */
export function AthleteEditDialog({ open, onClose, athlete, onSaved }: Props) {
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [sport, setSport] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [notes, setNotes] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Beim Öffnen die Felder aus dem Athleten vorbelegen.
  useEffect(() => {
    if (!open || !athlete) return;
    setFullName(athlete.full_name);
    setPosition(athlete.position ?? '');
    setSport(athlete.sport ?? '');
    setBirthDate(athlete.birth_date ?? '');
    setNotes(athlete.notes ?? '');
    setCode(athlete.code);
    setSaving(false);
    setError(null);
  }, [open, athlete]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!athlete) return;
    const name = fullName.trim();
    if (!name) {
      setError('Bitte einen Namen eingeben.');
      return;
    }
    const nextCode = code.trim();
    if (!isValidCode(nextCode)) {
      setError('Der Login-Code muss aus 6 Ziffern bestehen.');
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = getSupabaseClient();

    // 1) Code geändert? -> geschützte Server-Route (Auth-Login + athletes.code).
    if (nextCode !== athlete.code) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSaving(false);
        setError('Sitzung abgelaufen — bitte neu anmelden.');
        return;
      }
      const res = await fetch(`/api/athletes/${athlete.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: nextCode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSaving(false);
        setError(CODE_ERRORS[body.error ?? ''] ?? 'Code konnte nicht geändert werden.');
        return;
      }
    }

    // 2) Übrige Stammdaten via RLS-Client (der zurückgegebene Datensatz trägt den neuen Code).
    const { data, error: updErr } = await supabase
      .from('athletes')
      .update({
        full_name: name,
        position: position.trim() || null,
        sport: sport.trim() || null,
        birth_date: birthDate || null,
        notes: notes.trim() || null,
      })
      .eq('id', athlete.id)
      .select()
      .single();

    if (updErr || !data) {
      setSaving(false);
      setError(`Speichern fehlgeschlagen: ${updErr?.message ?? 'unbekannt'}`);
      return;
    }

    setSaving(false);
    onSaved(data);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Athlet bearbeiten">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="ae-name">
            Name
          </label>
          <input
            id="ae-name"
            type="text"
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="z. B. Lena Vogt"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="ae-pos">
            Position (optional)
          </label>
          <input
            id="ae-pos"
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="z. B. Außenbahn"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="ae-sport">
            Sportart (optional)
          </label>
          <input
            id="ae-sport"
            type="text"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            placeholder="z. B. Leichtathletik"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="ae-birth">
            Geburtsdatum (optional)
          </label>
          <input
            id="ae-birth"
            type="date"
            value={birthDate}
            max={todayISO()}
            onChange={(e) => setBirthDate(e.target.value)}
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="ae-notes">
            Notiz (optional)
          </label>
          <textarea
            id="ae-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Coach-Notiz, z. B. Ziele, Auffälligkeiten …"
            rows={3}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-foreground placeholder:text-foreground-subtle focus:border-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <label className={LABEL} htmlFor="ae-code">
              Login-Code
            </label>
            <button
              type="button"
              onClick={() => setCode(randomCode())}
              className="text-xs font-medium text-accent hover:underline"
            >
              Zufallscode
            </button>
          </div>
          <input
            id="ae-code"
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-stelliger Code"
            className={`${FIELD} font-mono tracking-[0.3em]`}
          />
          <p className="text-xs text-foreground-subtle">
            Ändert das Login des Athleten — ab dann meldet er sich mit dem neuen Code an.
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Speichern …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
