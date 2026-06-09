'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { getSupabaseClient } from '@/lib/supabase/client';
import { isBetter, sortMetrics } from '@/lib/metrics';
import { isRsaMetric } from '@/lib/rsa';
import { supportsSide, type Side } from '@/lib/laterality';
import { formatDate, formatDelta, formatNumber, formatValue } from '@/lib/format';
import {
  REPS_MAX,
  estimateOneRepMax,
  roundOneRepMax,
  supportsOneRepMax,
} from '@/lib/one-rep-max';
import type { MetricRow } from '@/lib/database.types';

const FIELD =
  'h-11 w-full rounded-xl border border-line bg-surface px-3 text-foreground placeholder:text-foreground-subtle focus:border-accent';
const LABEL = 'text-xs font-medium text-foreground-muted';

/** Lokales Datum (heute) als YYYY-MM-DD für <input type="date">. */
function todayInput(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Fortschritts-Text für die Feuerwerk-Karte, z. B. „−0,06 s schneller". */
function improvementText(value: number, priorBest: number, metric: MetricRow): string {
  const diff = value - priorBest;
  const verb = metric.higher_is_better ? 'besser' : 'schneller';
  return `${formatDelta(diff, metric.unit)} ${verb}`;
}

type MeasurementDialogProps = {
  open: boolean;
  onClose: () => void;
  athleteId: string;
  metrics: MetricRow[];
  defaultMetricId?: string | null;
  /** Wer trägt ein? Athlet-Ansicht: 'athlete'. */
  enteredBy: 'athlete' | 'coach';
  onSaved: () => void;
  /** Ein All-Time-Bestwert wurde eingetragen (Athlet ODER Coach) – wird beim
   *  Schließen ausgelöst. `detail` ist der Fortschritt, z. B. „−0,06 s schneller". */
  onPersonalBest?: (detail: string) => void;
};

export function MeasurementDialog({
  open,
  onClose,
  athleteId,
  metrics,
  defaultMetricId,
  enteredBy,
  onSaved,
  onPersonalBest,
}: MeasurementDialogProps) {
  const sorted = sortMetrics(metrics);
  const [metricId, setMetricId] = useState('');
  const [valueStr, setValueStr] = useState('');
  const [weightStr, setWeightStr] = useState('');
  const [repsStr, setRepsStr] = useState('1');
  const [side, setSide] = useState<'' | Side>('');
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedBest, setSavedBest] = useState<string | null>(null);
  const [pbHit, setPbHit] = useState(false);
  const valueRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  // Hält über die ganze Dialog-Sitzung fest, ob (mind.) ein PB erreicht wurde.
  const pbInSession = useRef(false);
  // Fortschritts-Text des letzten PB (für die Feuerwerk-Karte).
  const pbDetail = useRef<string | null>(null);

  // Beim Öffnen Felder zurücksetzen / Vorauswahl übernehmen.
  useEffect(() => {
    if (!open) return;
    setMetricId(defaultMetricId ?? sorted[0]?.id ?? '');
    setValueStr('');
    setWeightStr('');
    setRepsStr('1');
    setSide('');
    setNote('');
    setDate(todayInput());
    setError(null);
    setSavedBest(null);
    setPbHit(false);
    pbInSession.current = false;
    pbDetail.current = null;
    // sorted/defaultMetricId ändern sich nicht relevant während offen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMetricId]);

  // Wechselt Metrik oder Datum, passt das letzte Speicher-Feedback nicht mehr.
  useEffect(() => {
    setSavedBest(null);
    setPbHit(false);
  }, [metricId, date]);

  const metric = sorted.find((m) => m.id === metricId) ?? null;

  // 1RM-Rechner nur für Kraftübungen mit kg-Last. Live-Schätzung aus den Feldern.
  const is1rm = !!metric && supportsOneRepMax(metric);
  // Links/Rechts nur bei Richtungswechsel-Tests mit Drehung.
  const hasSide = supportsSide(metric);
  const weightNum = Number(weightStr.replace(',', '.'));
  const repsNum = Number(repsStr.replace(',', '.'));
  const est1rm = is1rm ? estimateOneRepMax(weightNum, repsNum) : NaN;
  const est1rmRounded = Number.isFinite(est1rm) ? roundOneRepMax(est1rm) : null;

  /** Schließen: wurde in dieser Sitzung ein PB erreicht (egal ob Athlet oder
   *  Coach), das Feuerwerk im Dashboard auslösen – „nach dem Schließen des Fensters". */
  function handleClose() {
    if (pbInSession.current) onPersonalBest?.(pbDetail.current ?? '');
    pbInSession.current = false;
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!metricId) {
      setError('Bitte eine Metrik wählen.');
      return;
    }

    // Kraftübung (kg): aus Last × Wiederholungen das 1RM schätzen und als Wert
    // speichern. Sonst: den eingegebenen Wert direkt übernehmen.
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

    // All-Time-Bestwert dieser Metrik VOR dem Speichern – Basis der PB-Erkennung.
    const { data: priorRows } = await supabase
      .from('measurements')
      .select('value')
      .eq('athlete_id', athleteId)
      .eq('metric_id', metricId);
    let priorBest: number | null = null;
    for (const r of priorRows ?? []) {
      if (priorBest === null || isBetter(r.value, priorBest, metric?.higher_is_better ?? false)) {
        priorBest = r.value;
      }
    }

    const { error: insErr } = await supabase.from('measurements').insert({
      athlete_id: athleteId,
      metric_id: metricId,
      value,
      // reps/weight nur bei 1RM-Übungen mitschreiben – sonst bleibt der Insert
      // frei von den neuen Spalten (kein Migrations-Zwang für alte Tests).
      ...(is1rm ? { reps, weight } : {}),
      // Seite nur bei Richtungswechsel-Tests und nur, wenn gewählt.
      ...(hasSide && side ? { side } : {}),
      tested_at: date, // DATE-Spalte: der gewählte Tag (YYYY-MM-DD), zeitzonensicher
      entered_by: enteredBy,
      note: note.trim() || null,
    });

    if (insErr) {
      setSaving(false);
      setError(`Speichern fehlgeschlagen: ${insErr.message}`);
      return;
    }

    // Tagesbestwert dieser Metrik ermitteln – über ALLE Roh-Einträge des Tages
    // (inkl. soeben gespeichert). Nichts wird gelöscht, nur zusammengefasst.
    const { data: dayRows } = await supabase
      .from('measurements')
      .select('value')
      .eq('athlete_id', athleteId)
      .eq('metric_id', metricId)
      .eq('tested_at', date);

    let best = value;
    for (const r of dayRows ?? []) {
      if (isBetter(r.value, best, metric?.higher_is_better ?? false)) best = r.value;
    }
    const bestStr = formatValue(best, metric?.unit ?? '');
    const isToday = date === todayInput();
    setSavedBest(
      isToday ? `Heutiger Bestwert: ${bestStr}` : `Tagesbestwert (${formatDate(date)}): ${bestStr}`,
    );

    // PB = bestehenden All-Time-Bestwert geschlagen. Der allererste Wert einer
    // Metrik (priorBest === null) zählt bewusst nicht als PB. RSA-Tests sind
    // ausgenommen: dort ist jeder Sprint Teil einer Session, kein eigener Rekord.
    const isPB =
      priorBest !== null &&
      !(metric && isRsaMetric(metric)) &&
      isBetter(value, priorBest, metric?.higher_is_better ?? false);
    if (isPB) {
      pbInSession.current = true;
      // Fortschritt ggü. dem bisherigen Bestwert für die Feuerwerk-Karte festhalten.
      if (priorBest !== null && metric) pbDetail.current = improvementText(value, priorBest, metric);
    }
    setPbHit(isPB);

    setSaving(false);
    onSaved();
    // Dialog bleibt offen: am selben Tag können beliebig viele Versuche folgen.
    setValueStr('');
    setWeightStr('');
    setRepsStr('1');
    setNote('');
    (is1rm ? weightRef : valueRef).current?.focus();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Wert eintragen">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="md-metric">
            Metrik
          </label>
          <select
            id="md-metric"
            value={metricId}
            onChange={(e) => setMetricId(e.target.value)}
            className={FIELD}
          >
            {sorted.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.unit ? ` (${m.unit})` : ''}
              </option>
            ))}
          </select>
        </div>

        {is1rm ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className={LABEL} htmlFor="md-weight">
                  Gewicht (kg)
                </label>
                <input
                  id="md-weight"
                  ref={weightRef}
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
                <label className={LABEL} htmlFor="md-reps">
                  Wdh.
                </label>
                <input
                  id="md-reps"
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
            <label className={LABEL} htmlFor="md-value">
              Wert{metric?.unit ? ` (${metric.unit})` : ''}
            </label>
            <input
              id="md-value"
              ref={valueRef}
              type="text"
              inputMode="decimal"
              autoFocus
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              placeholder={metric?.unit === 's' ? 'z. B. 1,81' : 'z. B. 245'}
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
          <label className={LABEL} htmlFor="md-date">
            Datum
          </label>
          <input
            id="md-date"
            type="date"
            value={date}
            max={todayInput()}
            onChange={(e) => setDate(e.target.value)}
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="md-note">
            Notiz (optional)
          </label>
          <input
            id="md-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Bedingungen, Gerät …"
            className={FIELD}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {savedBest && (
          <div className="flex flex-col gap-1.5">
            {pbHit && (
              <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent">
                Neue persönliche Bestleistung!
              </p>
            )}
            <p className="rounded-xl bg-success/10 px-3 py-2 text-sm font-medium text-success">
              Gespeichert. {savedBest}
            </p>
          </div>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>
            {savedBest ? 'Fertig' : 'Abbrechen'}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Speichern …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
