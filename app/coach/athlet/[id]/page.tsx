import { CoachAthleteDetail } from '@/components/coach-athlete-detail';

/** Coach-Detailseite eines Athleten. Zugriff nur mit Coach-Session. */
export default async function CoachAthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CoachAthleteDetail athleteId={id} />;
}
