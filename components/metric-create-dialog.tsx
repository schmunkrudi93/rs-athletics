'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { MetricCategory } from '@/lib/constants';

const FIELD =
  'h-11 w-full rounded-xl border border-line bg-surface px-3 text-foreground placeholder:text-foreground-subtle focus:border-accent';
const LABEL = 'text-xs font-medium text-foreground-muted';

/** Auswahl der Kategorie. „Sonstige" ist die natürliche Heimat neuer Tests;
 *  Sprint/Sprung mischt die Metrik unter die jeweiligen Standard-Reiter. */
const CATEGORY_OPTIONS: { value: MetricCategory; label: string }[] = [
  { value: 'custom', label: 'Sonstige' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'jump', label: 'Sprung' },
  { value: 'strength', label: 'Kraft' },
  { value: 'cod', label: 'Richtungswechsel' },
  { value: 'endurance', label: 'Ausdauer' },
];

/** Eindeutiger key ohne crypto (läuft auch über LAN-HTTP ohne secure context). */
function genKey(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Liste nach erfolgreichem Anlegen neu laden. */
  onCreated: () => void;
};

/** Eine eigene Metrik (Test) anlegen. Gilt global – für alle Athleten verfügbar. */
export function MetricCreateDialog({ open, onClose, onCreated }: Props) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<MetricCategory>('custom');
  const [unit, setUnit] = useState('');
  const [higher, setHigher] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel('');
    setCategory('custom');
    setUnit('');
    setHigher(true);
    setSaving(false);
    setError(null);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = label.trim();
    if (!name) {
      setError('Bitte einen Namen für die Metrik eingeben.');
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: insErr } = await supabase.from('metrics').insert({
      key: genKey(),
      label: name,
      category,
      unit: unit.trim(), // Spalte ist NOT NULL -> leerer String statt null
      higher_is_better: higher,
      is_custom: true,
      sort_order: 1000, // nach den Standard-Metriken einsortieren
    });

    if (insErr) {
      setSaving(false);
      setError(`Anlegen fehlgeschlagen: ${insErr.message}`);
      return;
    }

    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Neue Metrik">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="mc-label">
            Name
          </label>
          <input
            id="mc-label"
            type="text"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="z. B. Medizinball-Wurf"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="mc-category">
            Reiter
          </label>
          <select
            id="mc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as MetricCategory)}
            className={FIELD}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="mc-unit">
            Einheit (optional)
          </label>
          <input
            id="mc-unit"
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="z. B. s, cm, kg, m/s, reps"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL} htmlFor="mc-dir">
            Bewertung
          </label>
          <select
            id="mc-dir"
            value={higher ? 'higher' : 'lower'}
            onChange={(e) => setHigher(e.target.value === 'higher')}
            className={FIELD}
          >
            <option value="higher">Mehr ist besser (z. B. cm, kg)</option>
            <option value="lower">Weniger ist besser (z. B. Zeit in s)</option>
          </select>
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
    </Modal>
  );
}
