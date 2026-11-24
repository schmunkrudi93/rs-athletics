'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth-client';

/** Kopfzeile mit Logo, Tempo-Timer-Link und „Abmelden / Athlet wechseln". */
export function TopBar({
  children,
  showTempoLink = true,
}: {
  children?: React.ReactNode;
  /** Link zum Tempo-Timer (auf der Timer-Seite selbst ausgeblendet). */
  showTempoLink?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    setBusy(true);
    try {
      await logout();
    } finally {
      // Immer zum Login zurück – auch wenn das Abmelden selbst scheitert.
      router.replace('/');
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/85 pt-safe backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Logo variant="horizontal" height={24} />
        <div className="flex items-center gap-2">
          {children}
          {showTempoLink && (
            <Link
              href="/tempo"
              className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3 text-sm font-medium text-foreground transition hover:border-accent/50"
            >
              Tempo
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={onLogout} disabled={busy}>
            Abmelden
          </Button>
        </div>
      </div>
    </header>
  );
}
