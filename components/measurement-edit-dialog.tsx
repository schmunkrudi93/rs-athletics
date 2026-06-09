'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { getSupabaseClient } from '@/lib/supabase/client';
import { supportsSide, type Side } from '@/lib/laterality';
import { formatNumber, formatValue } from '@/lib/format';
import {
  REPS_MAX,
  estimateOneRepMax,
  roundOneRepMax,
  supportsOneRepMax,
} from '@/lib/one-rep-max';
import type { MeasurementRow, MetricRow } from '@/lib/database.types';

const FIELD =
  'h-11 w-full rounded-xl border border-line bg-surface px-3 text-foreground placeholder:text-foreground-subtle focus:border-accent';
const LABEL = 'text-xs font-medium text-foreground-muted';

/** Lokales Datum (heute) als YYYY-MM-DD für das max-Attribut. */
function todayInput(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onClose: () => void;
  measurement: MeasurementRow | null;
  metric: MetricRow | null;
  onSaved: () => void;
  onDeleted: () => void;
};

/** Einen vorhandenen Messwert korrigieren (Wert/Datum/Notiz) oder löschen.
 *  Die Metrik bleibt fix – ein „falscher Metrik"-Eintrag wäre eher löschen + neu. */
export function MeasurementEditDialog({
  open,
  onClose,
  measurement,
  metric,
  onSaved,
  onDeleted,
}: Props) {
  const [valueStr, setValueStr] = useState('');
  const [weightStr, setWeightStr] = useState('');
  const [repsStr, setRepsStr] = useState('1');
  const [side, setSide] = useState<'' | Side>('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const is1rm = !!metric && supportsOneRepMax(metric);
  // Links/Rechts nur bei Richtungswechsel-Tests mit Drehung.
  const hasSide = supportsSide(metric);

  // Beim Öffnen die Felder aus dem Messwert vorbelegen.
  useEffect(() => {
    if (!open || !measurement) return;
    setValueStr(String(measurement.value).replace('.', ','));
    // 1RM-Übung: Last × Wdh. vorbelegen. Altdaten ohne reps/weight (z. B. 1×100)
    // bekommen Wdh. = 1 und Last = gespeicherter Wert.
    setWeightStr(
      String(measurement.weight ?? measurement.value).replace('.', ','),
    );
    setRepsStr(String(measurement.reps ?? 1));
    setSide(measurement.side ?? '');
    setDate(measurement.tested_at.slice(0, 10));
    setNote(measurement.note ?? '');
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
    setError(null);
  }, [open, measurement]);

  // Live-Schätzung des 1RM aus den Eingabefeldern (nur bei Kraft/kg).
  const weightNum = Number(weightStr.replace(',', '.'));
  const repsNum = Number(repsStr.replace(',', '.'));
  const est1rm = is1rm ? estimateOneRepMax(weightNum, repsNum) : NaN;
  const est1rmRounded = Number.isFinite(est1rm) ? roundOneRepMax(est1rm) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!measurement) return;

    // Wie im Eintragen-Dialog: bei Kraft/kg aus Last × Wdh. das 1RM neu rechnen.
    let value: number;
    let reps: number | null = null;
    let weight: number | null = null;
    if (is1rm) {
      if (!weightStr.trim() || !Number.isFinite(weightNum) || weightNum <= 0) {
        setError('Bitte ein gültiges Gewicht eingeben.');
        return;
      }
      if (!Number.isInteger(repsNum) || repsNum < 1 || repsNum > REPS_MAX) {
        setError(`Bitte 1 bis ${REPS_MAX} Wiederholungen eingeben.`);
        return;
      }
      const oneRm = estimateOneRepMax(weightNum, repsNum);
      if (!Number.isFinite(oneRm)) {
        setError('Das 1RM konnte nicht berechnet werden.');
        return;
      }
      value = roundOneRepMax(oneRm);
      reps = repsNum;
      weight = weightNum;
    } else {
      value = Number(valueStr.replace(',', '.'));
      if (!valueStr.trim() || !Number.isFinite(value)) {
        setError('Bitte einen gültigen Wert eingeben.');
        return;
      }
      if (value < 0) {
        setError('Der Wert darf nicht negativ sein.');
        return;
      }
    }

    setSaving(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: updErr } = await supabase
      .from('measurements')
      .update({
        value,
        ...(is1rm ? { reps, weight } : {}),
        // Seite nur bei Richtungswechsel-Tests; '' (ohne) wird zu null.
        ...(hasSide ? { side: side || null } : {}),
        tested_at: date,
        note: note.trim() || null,
      })
      .eq('id', measurement.id);

    if (updErr) {
      setSaving(false);
      setError(`Speichern fehlgeschlagen: ${updErr.message}`);
      return;
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  async function onDelete() {
    if (!measurement) return;
    setDeleting(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: delErr } = await supabase
      .from('measurements')
      .delete()
      .eq('id', measurement.id);

    if (delErr) {
      setDeleting(false);
      setError(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    setDeleting(false);
    onDeleted();
    onClose();
  }

  const busy = saving || deleting;

  return (
    <Modal open={open} onClose={onClose} title="Wert bearbeiten">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {metric && (
          <p className="text-sm text-foreground-muted">
            Metrik: <span className="font-medium text-foreground">{metric.label}</span>
            {metric.unit ? ` (${metric.unit})` : ''}
          </p>
        )}

        {is1rm ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className={LABEL} htmlFor="me-weight">
                  Gewicht (kg)
                </label>
                <input
                  id="me-weight"
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={weightStr}
                  onChange={(e) => setWeightStr(e.target.value)}
                  placeholder="z. B. 50"
                  className={FIELD}
                />
              </div>
              <div className="flex w-24 flex-col gap-1.5">
                <label className={LABEL} htmlFor="me-reps">
                  Wdh.
                </label>
                <input
                  id="me-reps"
                  type="text"
                  inputMode="numeric"
                  value={repsStr}
                  onChange={(e) => setRepsStr(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="z. B. 3"
                  className={FIELD}
                />
              </div>
            </div>
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-foreground-muted">
              {est1rmRounded !== null
                ? `Geschätztes 1RM: ${formatValue(est1rmRounded, 'kg')}${
                    repsNum > 1
                      ? ` · aus ${repsNum} × ${formatNumber(weightNum, 'kg')} kg (Brzycki)`
                      : ''
                  }`
                : 'Gewicht und Wiederholungen eingeben …'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className={LABEL} htmlFor="me-value">
              Wert{metric?.unit ? ` (${metric.unit})` : ''}
            </label>
            <input
              id="me-value"
              type="text"
              inputMode="decimal"
              autoFocus
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              className={FIELD}
            />
          </div>
        )}

        {hasSide && (
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>Seite</span>
            <Segmented
              options={[
                { key: 'left', label: 'Links' },
                { key: 'right', label: 'Rechts' },
                { key: '', label: 'ohne' },
              ]}
              value={side}
              onChange={setSide}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="me-date">
            Datum
          </label>
          <input
            id="me-date"
            type="date"
            value={date}
            max={todayInput()}
            onChange={(e) => setDate(e.target.value)}
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="me-note">
            Notiz (optional)
          </label>
          <input
            id="me-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Bedingungen, Gerät …"
            className={FIELD}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
            <p className="text-sm text-foreground">Diesen Wert wirklich löschen?</p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
              >
                Abbrechen
              </Button>
              <Button type="button" variant="danger" onClick={onDelete} disabled={busy}>
                {deleting ? 'Löschen …' : 'Endgültig löschen'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              Löschen
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={busy}>
                {saving ? 'Speichern …' : 'Speichern'}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
