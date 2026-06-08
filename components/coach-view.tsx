'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { LoadingScreen } from '@/components/loading-screen';
import { Button } from '@/components/ui/button';
import { AthleteCreateDialog } from '@/components/athlete-create-dialog';
import { useRequireRole } from '@/lib/hooks/use-require-role';
import { getSupabaseClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';
import type { AthleteRow } from '@/lib/database.types';

export function CoachView() {
  const guard = useRequireRole('coach');

  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Roster laden – RLS erlaubt dem Coach alle Athleten, einem Athleten nur sich selbst.
  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('athletes')
      .select('*')
      .order('full_name', { ascending: true });
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setAthletes(data ?? []);
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (guard.status !== 'authorized') return;
    setLoading(true);
    void load();
  }, [guard.status, load]);

  if (guard.status !== 'authorized') return <LoadingScreen />;

  const active = athletes.filter((a) => a.is_active);
  const archived = athletes.filter((a) => !a.is_active);
  const count = active.length;

  return (
    <div className="min-h-dvh pb-12">
      <TopBar />

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Athleten</h1>
            <p className="text-sm text-foreground-muted">
              {loading ? 'lädt …' : `${count} ${count === 1 ? 'Athlet' : 'Athleten'}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/coach/metriken"
              className="inline-flex h-9 select-none items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-foreground transition hover:border-accent/50 active:scale-[0.98]"
            >
              Metriken
            </Link>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              + Neuer Athlet
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="card border-danger/40 p-4 text-sm text-danger">
            Athleten konnten nicht geladen werden: {loadError}
          </div>
        )}

        {loading ? (
          <SkeletonList />
        ) : athletes.length === 0 ? (
          <EmptyRoster onAdd={() => setDialogOpen(true)} />
        ) : (
          <>
            {active.length === 0 ? (
              <p className="card px-4 py-6 text-center text-sm text-foreground-muted">
                Keine aktiven Athleten – alle sind archiviert.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {active.map((a) => (
                  <RosterRow key={a.id} athlete={a} />
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
                    {archived.map((a) => (
                      <RosterRow key={a.id} athlete={a} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <AthleteCreateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={load} />
    </div>
  );
}

function RosterRow({ athlete }: { athlete: AthleteRow }) {
  const subtitle = [athlete.position, athlete.sport].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        href={`/coach/athlet/${athlete.id}`}
        className="card flex items-center gap-3 p-3 transition hover:border-accent/50 active:scale-[0.99]"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-strong font-display text-sm font-bold text-white">
          {initials(athlete.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate font-medium text-foreground">
              {athlete.full_name}
            </span>
            {!athlete.is_active && (
              <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                inaktiv
              </span>
            )}
          </div>
          <p className="truncate text-xs text-foreground-muted">{subtitle || '—'}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground">
            {athlete.code}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-foreground-subtle">Code</p>
        </div>
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0 text-foreground-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </Link>
    </li>
  );
}

function EmptyRoster({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-sm text-foreground-muted">Noch keine Athleten angelegt.</p>
      <Button size="sm" variant="outline" onClick={onAdd}>
        Ersten Athleten anlegen
      </Button>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-2.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="card h-[68px] animate-pulse bg-surface" />
      ))}
    </ul>
  );
}
