import { Logo } from '@/components/logo';

/** Ganzseitiger Ladezustand (z. B. während der Session-Prüfung). */
export function LoadingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <Logo variant="submark" height={64} className="animate-pulse" />
    </main>
  );
}
