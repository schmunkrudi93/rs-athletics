'use client';

import { useEffect } from 'react';

/**
 * Registriert den Service Worker (nur im Browser, nur in Produktion sinnvoll).
 * Hält sich bewusst minimal — der eigentliche Cache lebt in /public/sw.js.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Im Dev nicht registrieren -> kein Cache-Ärger mit Hot-Reload.
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          // Registrierung darf die App nie blockieren.
          console.warn('Service Worker Registrierung fehlgeschlagen:', err);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
