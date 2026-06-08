'use client';

import { TopBar } from '@/components/top-bar';
import { LoadingScreen } from '@/components/loading-screen';
import { AthleteDashboard } from '@/components/athlete-dashboard';
import { useRequireRole } from '@/lib/hooks/use-require-role';

/** Eigenansicht des Athleten: eigenes Dashboard inkl. Eintragen. */
export function AthleteView() {
  const guard = useRequireRole('athlete');
  const athleteId = guard.session?.athleteId ?? null;

  if (guard.status !== 'authorized' || !athleteId) return <LoadingScreen />;

  return (
    <div className="min-h-dvh pb-12">
      <TopBar />
      <AthleteDashboard
        athleteId={athleteId}
        enableEntry
        enteredBy="athlete"
        enableEdit
        canEditMeasurement={(m) => m.entered_by === 'athlete'}
      />
    </div>
  );
}
