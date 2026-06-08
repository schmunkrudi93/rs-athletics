'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveSession, type Session } from '@/lib/auth-client';
import type { Role } from '@/lib/constants';

type RoleState =
  | { status: 'loading'; session: null }
  | { status: 'authorized'; session: Session }
  | { status: 'denied'; session: null };

/**
 * Client-Guard: stellt sicher, dass eine gültige Session mit der erwarteten
 * Rolle existiert. Sonst Redirect (zum Login bzw. zur korrekten Ansicht).
 */
export function useRequireRole(role: Role): RoleState {
  const router = useRouter();
  const [state, setState] = useState<RoleState>({ status: 'loading', session: null });

  useEffect(() => {
    let active = true;
    getActiveSession()
      .then((session) => {
        if (!active) return;
        if (!session) {
          setState({ status: 'denied', session: null });
          router.replace('/');
          return;
        }
        if (session.role !== role) {
          setState({ status: 'denied', session: null });
          router.replace(session.role === 'coach' ? '/coach' : '/athlet');
          return;
        }
        setState({ status: 'authorized', session });
      })
      .catch(() => {
        if (!active) return;
        setState({ status: 'denied', session: null });
        router.replace('/');
      });
    return () => {
      active = false;
    };
  }, [role, router]);

  return state;
}
