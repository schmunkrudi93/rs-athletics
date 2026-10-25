'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { supportsSide, type Side } from '@/lib/laterality';
import { todayISO } from '@/lib/format';
import type { MetricRow } from '@/lib/database.types';

const FIELD =
  'h-11 w-full rounded-xl border border-line bg-surface px-3 text-foreground placeholder:text-foreground-subtle focus:border-accent';
const LABEL = 'text-xs font-medium text-foreground-muted';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  athleteId: string;
  /** Alle Metriken der Unterseite – je Metrik ein Feld (Gliedmaßen: Links + Rechts). */
  metrics: MetricRow[];
  enteredBy: 'athlete' | 'coach';
  onSaved: () => void;
};

/** Feld-Schlüssel: metricId bzw. metricId:left/right bei Gliedmaßen. */
function fieldKey(metricId: string, side?: Side) {
  return side ? `${metricId}:${side}` : metricId;
}

/**
 * Health-Eingabe: alle Werte einer Unterseite in EINEM Formular (z. B. alle
 * Umfänge oder Ruhepuls + HRV vom Morgen). Leere Felder werden übersprungen.
 * Kein PB/Feuerwerk – Health-Werte sind Verlauf, keine Bestleistung.
 */
export function HealthEntryDialog({
  open,
  onClose,
  title,
  athleteId,
  metrics,
  enteredBy,
  onSaved,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues({});
    setDate(todayISO());
    setNote('');
    setSaving(false);
    setError(null);
  }, [open]);

  const setField = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rows: { metric_id: string; value: number; side?: Side }[] = [];
    for (const m of metrics) {
      const sides: (Side | undefined)[] = supportsSide(m) ? ['left', 'right'] : [undefined];
      for (const side of sides) {
        const raw = values[fieldKey(m.id, side)]?.trim();
        if (!raw) continue;
        const value = Number(raw.replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0) {
          setError(`Ungültiger Wert bei „${m.label}“.`);
          return;
        }
        rows.push({ metric_id: m.id, value, ...(side ? { side } : {}) });
      }
    }
    if (rows.length === 0) {
      setError('Bitte mindestens einen Wert eintragen.');
      return;
    }

    setSaving(true);
    setError(null);
    const { error: insErr } = await getSupabaseClient()
      .from('measurements')
      .insert(
        rows.map((r) => ({
          athlete_id: athleteId,
          ...r,
          tested_at: date,
          entered_by: enteredBy,
          note: note.trim() || null,
        })),
      );
    setSaving(false);
    if (insErr) {
      setError(`Speichern fehlgeschlagen: ${insErr.message}`);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Zweispaltig, damit z. B. alle Umfänge ohne langes Scrollen passen;
            Gliedmaßen (Links/Rechts) und ein einzelnes Feld nehmen die volle Breite. */}
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((m, i) =>
            supportsSide(m) ? (
              <div key={m.id} className="col-span-2 flex flex-col gap-1.5">
                <span className={LABEL}>
                  {m.label} ({m.unit})
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(['left', 'right'] as const).map((side) => (
                    <input
                      key={side}
                      aria-label={`${m.label} ${side === 'left' ? 'links' : 'rechts'}`}
                      type="text"
                      inputMode="decimal"
                      value={values[fieldKey(m.id, side)] ?? ''}
                      onChange={(e) => setField(fieldKey(m.id, side), e.target.value)}
                      placeholder={side === 'left' ? 'Links' : 'Rechts'}
                      className={FIELD}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div
                key={m.id}
                className={`flex flex-col gap-1.5 ${metrics.length === 1 ? 'col-span-2' : ''}`}
              >
                <label className={LABEL} htmlFor={`he-${m.id}`}>
                  {m.label} ({m.unit})
                </label>
                <input
                  id={`he-${m.id}`}
                  type="text"
                  inputMode="decimal"
                  autoFocus={i === 0}
                  value={values[fieldKey(m.id)] ?? ''}
                  onChange={(e) => setField(fieldKey(m.id), e.target.value)}
                  className={FIELD}
                />
              </div>
            ),
          )}
        </div>

        {metrics.length > 1 && (
          <p className="text-xs text-foreground-subtle">
            Nur ausfüllen, was du gemessen hast – leere Felder werden übersprungen.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="he-date">
            Datum
          </label>
          <input
            id="he-date"
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="he-note">
            Notiz (optional)
          </label>
          <input
            id="he-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. morgens nüchtern, schlecht geschlafen …"
            className={FIELD}
          />
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
