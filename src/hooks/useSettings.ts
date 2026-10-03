'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, parseHash, settingsHash } from '@/lib/settings';
import type { Settings } from '@/types/wiki';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => setSettings(current => ({ ...current, ...parseHash(window.location.hash) }));
    // Hydrate browser-only URL preferences after the server render.
    read();
    // URL preferences cannot be read during SSR; this is a one-time hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    window.history.replaceState(null, '', settingsHash(next));
    setSettings(next);
  };
  return { settings, update, ready };
}
