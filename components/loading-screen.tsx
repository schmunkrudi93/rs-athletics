import { Logo } from '@/components/logo';

/** Ganzseitiger Ladezustand (z. B. während der Session-Prüfung). */
export function LoadingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <Logo size={56} showWordmark={false} className="animate-pulse" />
    </main>
  );
}
