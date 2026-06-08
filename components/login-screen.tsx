'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { NumericKeypad } from '@/components/numeric-keypad';
import { clsx } from '@/lib/clsx';
import { CODE_LENGTH, type Role } from '@/lib/constants';
import {
  getActiveSession,
  loginWithCode,
  InvalidCodeError,
  RateLimitError,
} from '@/lib/auth-client';

function destinationFor(role: Role): string {
  return role === 'coach' ? '/coach' : '/athlet';
}

type Phase = 'checking' | 'idle' | 'submitting' | 'success';

/** Login-Screen: Zugang ausschließlich über den 6-stelligen Zahlencode. */
export function LoginScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Bereits angemeldet? -> direkt zur passenden Ansicht.
  useEffect(() => {
    let active = true;
    getActiveSession()
      .then((session) => {
        if (!active) return;
        if (session) {
          setPhase('success');
          router.replace(destinationFor(session.role));
        } else {
          setPhase('idle');
        }
      })
      .catch(() => active && setPhase('idle'));
    return () => {
      active = false;
    };
  }, [router]);

  const submit = useCallback(
    async (fullCode: string) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setPhase('submitting');
      setError(null);
      try {
        const session = await loginWithCode(fullCode);
        setPhase('success');
        router.replace(destinationFor(session.role));
      } catch (err) {
        submittingRef.current = false;
        setCode('');
        setPhase('idle');
        if (err instanceof RateLimitError) {
          setError(`Zu viele Versuche. Bitte in ${err.retryAfterSec}s erneut.`);
        } else if (err instanceof InvalidCodeError) {
          setError('Code ungültig. Bitte erneut versuchen.');
        } else {
          setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
        }
      }
    },
    [router],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (submittingRef.current) return;
      setError(null);
      setCode((prev) => {
        if (prev.length >= CODE_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === CODE_LENGTH) void submit(next);
        return next;
      });
    },
    [submit],
  );

  const handleDelete = useCallback(() => {
    if (submittingRef.current) return;
    setError(null);
    setCode((prev) => prev.slice(0, -1));
  }, []);

  // Physische Tastatur (praktisch am Desktop für den Coach).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleDigit, handleDelete]);

  if (phase === 'checking' || phase === 'success') {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <Logo size={64} showWordmark={false} className="animate-pulse" />
      </main>
    );
  }

  const busy = phase === 'submitting';

  return (
    <main className="grid min-h-dvh place-items-center px-6 pb-safe pt-safe">
      <div className="flex w-full max-w-xs flex-col items-center gap-8">
        <Logo size={64} showWordmark showTagline />

        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-sm text-foreground-muted">Code eingeben</p>
          <CodeDisplay code={code} length={CODE_LENGTH} busy={busy} />
          <p
            className={clsx(
              'min-h-5 text-center text-sm',
              error ? 'text-danger' : 'text-transparent',
            )}
            role="alert"
          >
            {error ?? '—'}
          </p>
        </div>

        <div className="w-full">
          <NumericKeypad onDigit={handleDigit} onDelete={handleDelete} disabled={busy} />
        </div>
      </div>
    </main>
  );
}

function CodeDisplay({
  code,
  length,
  busy,
}: {
  code: string;
  length: number;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length }).map((_, i) => {
        const filled = i < code.length;
        const active = i === code.length && !busy;
        return (
          <div
            key={i}
            className={clsx(
              'grid h-12 w-9 place-items-center rounded-xl border bg-surface font-display text-xl font-semibold tabular-nums',
              filled ? 'border-accent/60 text-foreground' : 'border-line text-foreground-subtle',
              active && 'border-accent ring-2 ring-accent/30',
            )}
          >
            {filled ? code[i] : ''}
          </div>
        );
      })}
    </div>
  );
}
