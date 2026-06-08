'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/top-bar';
import { LoadingScreen } from '@/components/loading-screen';
import { AthleteDashboard } from '@/components/athlete-dashboard';
import { AthleteEditDialog } from '@/components/athlete-edit-dialog';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useRequireRole } from '@/lib/hooks/use-require-role';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { AthleteRow } from '@/lib/database.types';

/** Coach sieht das Dashboard eines Athleten und kann im Testing-Modus Werte
 *  erfassen – Einträge werden automatisch als „Coach" gekennzeichnet.
 *  Außerdem: einzelne Werte korrigieren (Stift), Stammdaten bearbeiten und den
 *  Athleten archivieren/reaktivieren bzw. endgültig entfernen. */
export function CoachAthleteDetail({ athleteId }: { athleteId: string }) {
  const guard = useRequireRole('coach');

  if (guard.status !== 'authorized') return <LoadingScreen />;

  return (
    <div className="min-h-dvh pb-12">
      <TopBar />
      <AthleteDashboard
        athleteId={athleteId}
        backHref="/coach"
        enableEntry
        enteredBy="coach"
        enableEdit
        footer={({ reload }) => <CoachAthleteActions athleteId={athleteId} onChanged={reload} />}
      />
    </div>
  );
}

const REMOVE_ERRORS: Record<string, string> = {
  unauthorized: 'Nicht angemeldet – bitte neu einloggen.',
  forbidden: 'Nur der Coach darf Athleten entfernen.',
  id_required: 'Athlet nicht gefunden.',
  athlete_delete_failed: 'Athlet konnte nicht entfernt werden.',
};

/** Verwaltung am Seitenende: Bearbeiten, Archivieren (reversibel) und Entfernen. */
function CoachAthleteActions({
  athleteId,
  onChanged,
}: {
  athleteId: string;
  /** Dashboard-Kopf nach Änderungen neu laden. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAthlete = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('athletes').select('*').eq('id', athleteId).single();
    if (data) setAthlete(data);
  }, [athleteId]);

  useEffect(() => {
    void loadAthlete();
  }, [loadAthlete]);

  const isActive = athlete?.is_active ?? null;

  async function toggleArchive() {
    if (!athlete) return;
    const next = !athlete.is_active;
    setToggling(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: updErr } = await supabase
      .from('athletes')
      .update({ is_active: next })
      .eq('id', athleteId);
    setToggling(false);
    if (updErr) {
      setError(`Status ändern fehlgeschlagen: ${updErr.message}`);
      return;
    }
    setAthlete({ ...athlete, is_active: next });
    onChanged();
  }

  async function removeAthlete() {
    setRemoving(true);
    setError(null);
    const supabase = getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setRemoving(false);
      setError('Nicht angemeldet – bitte neu einloggen.');
      return;
    }
    const res = await fetch(`/api/athletes/${athleteId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setRemoving(false);
      setError(REMOVE_ERRORS[json.error ?? ''] ?? 'Entfernen fehlgeschlagen.');
      return;
    }
    // Weg hier – der Athlet existiert nicht mehr.
    router.push('/coach');
  }

  return (
    <section className="card mt-2 flex flex-col gap-3 p-4">
      <div>
        <h2 className="font-display text-base font-semibold text-foreground">Verwaltung</h2>
        <p className="text-xs text-foreground-subtle">
          {isActive === null
            ? 'Status lädt …'
            : isActive
              ? 'Athlet ist aktiv.'
              : 'Athlet ist archiviert (in der Liste ausgegraut).'}
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
          disabled={!athlete || removing}
        >
          Bearbeiten
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleArchive}
          disabled={isActive === null || toggling || removing}
        >
          {toggling ? 'Speichern …' : isActive ? 'Archivieren' : 'Reaktivieren'}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => setConfirmRemove(true)}
          disabled={removing}
          className="ml-auto"
        >
          Endgültig entfernen
        </Button>
      </div>

      <AthleteEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        athlete={athlete}
        onSaved={(updated) => {
          setAthlete(updated);
          onChanged();
        }}
      />

      <Modal
        open={confirmRemove}
        onClose={() => !removing && setConfirmRemove(false)}
        title="Athlet entfernen"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground-muted">
            <span className="font-medium text-foreground">
              {athlete?.full_name || 'Diesen Athleten'}
            </span>{' '}
            wird mit allen Messwerten und dem Login{' '}
            <span className="font-medium text-danger">unwiderruflich</span> gelöscht. Zum nur
            vorübergehenden Ausblenden lieber archivieren statt entfernen.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmRemove(false)}
              disabled={removing}
            >
              Abbrechen
            </Button>
            <Button type="button" variant="danger" onClick={removeAthlete} disabled={removing}>
              {removing ? 'Entfernen …' : 'Endgültig entfernen'}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
