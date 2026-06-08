'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { LoadingScreen } from '@/components/loading-screen';
import { Button } from '@/components/ui/button';
import { MetricCreateDialog } from '@/components/metric-create-dialog';
import { useRequireRole } from '@/lib/hooks/use-require-role';
import { getSupabaseClient } from '@/lib/supabase/client';
import { sortMetrics } from '@/lib/metrics';
import type { MetricRow } from '@/lib/database.types';

const CATEGORY_LABELS: Record<string, string> = {
  sprint: 'Sprint',
  jump: 'Sprung',
  strength: 'Kraft',
  cod: 'Richtungswechsel',
  endurance: 'Ausdauer',
  custom: 'Sonstige',
};

/** Coach verwaltet alle Metriken (Tests): archivieren (ausblenden, Werte bleiben),
 *  reaktivieren und eigene zusätzlich löschen. Standard-Tests können nur
 *  archiviert, nicht gelöscht werden. */
export function CoachMetrics() {
  const guard = useRequireRole('coach');

  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('metrics').select('*');
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setMetrics(sortMetrics(data ?? []));
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (guard.status !== 'authorized') return;
    setLoading(true);
    void load();
  }, [guard.status, load]);

  if (guard.status !== 'authorized') return <LoadingScreen />;

  const active = metrics.filter((m) => m.is_active !== false);
  const archived = metrics.filter((m) => m.is_active === false);
  const count = active.length;

  return (
    <div className="min-h-dvh pb-12">
      <TopBar />

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5">
        <Link
          href="/coach"
          className="-mb-2 inline-flex w-fit items-center gap-1.5 text-sm text-foreground-muted transition hover:text-foreground"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 4l-4 4 4 4" />
          </svg>
          Athletenliste
        </Link>

        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Metriken</h1>
            <p className="text-sm text-foreground-muted">
              {loading ? 'lädt …' : `${count} aktive ${count === 1 ? 'Metrik' : 'Metriken'}`}
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            + Neue Metrik
          </Button>
        </div>

        <p className="text-xs text-foreground-subtle">
          Archivierte Tests verschwinden aus dem Dashboard, alle Werte bleiben erhalten – jederzeit
          reaktivierbar. Eigene Metriken lassen sich zusätzlich löschen; Standard-Tests nur
          archivieren.
        </p>

        {loadError && (
          <div className="card border-danger/40 p-4 text-sm text-danger">
            Metriken konnten nicht geladen werden: {loadError}
          </div>
        )}

        {loading ? (
          <SkeletonList />
        ) : (
          <>
            {active.length === 0 ? (
              <p className="card px-4 py-6 text-center text-sm text-foreground-muted">
                Keine aktiven Metriken.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {active.map((m) => (
                  <MetricRowItem key={m.id} metric={m} onChanged={load} />
                ))}
              </ul>
            )}

            {archived.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  aria-expanded={showArchived}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition hover:text-foreground"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className={`h-3.5 w-3.5 transition-transform duration-150 ${showArchived ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                  Archiviert ({archived.length})
                </button>
                {showArchived && (
                  <ul className="flex flex-col gap-2.5">
                    {archived.map((m) => (
                      <MetricRowItem key={m.id} metric={m} onChanged={load} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <MetricCreateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={load} />
    </div>
  );
}

function MetricRowItem({ metric, onChanged }: { metric: MetricRow; onChanged: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archived = metric.is_active === false;
  const subtitle = [
    CATEGORY_LABELS[metric.category] ?? metric.category,
    metric.unit || 'ohne Einheit',
    metric.higher_is_better ? 'mehr = besser' : 'weniger = besser',
  ].join(' · ');

  async function toggleArchive() {
    setBusy(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: updErr } = await supabase
      .from('metrics')
      .update({ is_active: archived })
      .eq('id', metric.id);
    setBusy(false);
    if (updErr) {
      setError(`Status ändern fehlgeschlagen: ${updErr.message}`);
      return;
    }
    onChanged();
  }

  async function onDelete() {
    setBusy(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: delErr } = await supabase.from('metrics').delete().eq('id', metric.id);
    if (delErr) {
      setBusy(false);
      // 23503 = Foreign-Key-Verletzung: es hängen bereits Messwerte dran.
      setError(
        delErr.code === '23503'
          ? 'Hat bereits Messwerte – nur archivieren möglich, nicht löschen.'
          : `Löschen fehlgeschlagen: ${delErr.message}`,
      );
      return;
    }
    setBusy(false);
    onChanged();
  }

  return (
    <li className="card flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{metric.label}</span>
            {archived && (
              <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                archiviert
              </span>
            )}
          </div>
          <p className="truncate text-xs text-foreground-muted">{subtitle}</p>
        </div>
        {!confirm && (
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={toggleArchive} disabled={busy}>
              {archived ? 'Reaktivieren' : 'Archivieren'}
            </Button>
            {metric.is_custom && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  setError(null);
                  setConfirm(true);
                }}
                disabled={busy}
              >
                Löschen
              </Button>
            )}
          </div>
        )}
      </div>

      {confirm && (
        <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
          <p className="text-sm text-foreground">Diese Metrik wirklich löschen?</p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirm(false)}
              disabled={busy}
            >
              Abbrechen
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={onDelete} disabled={busy}>
              {busy ? 'Löschen …' : 'Endgültig löschen'}
            </Button>
          </div>
        </div>
      )}

      {error && !confirm && <p className="text-sm text-danger">{error}</p>}
    </li>
  );
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-2.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="card h-[64px] animate-pulse bg-surface" />
      ))}
    </ul>
  );
}
