'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth-client';

/** Kopfzeile mit Logo und „Abmelden / Athlet wechseln". */
export function TopBar({ children }: { children?: React.ReactNode }) {
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
        <Logo size={30} showWordmark />
        <div className="flex items-center gap-2">
          {children}
          <Button variant="outline" size="sm" onClick={onLogout} disabled={busy}>
            Abmelden
          </Button>
        </div>
      </div>
    </header>
  );
}
