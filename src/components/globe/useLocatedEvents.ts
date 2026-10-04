import { useMemo } from 'react';
import type { WikiEvent } from '@/types/wiki';
export type Location = { lat: number; lon: number };
export type LocatedEvent = WikiEvent & { location: Location };
export function useLocatedEvents(events: WikiEvent[]) {
  const located = useMemo(() => events.filter((event): event is LocatedEvent => Boolean(event.location)).reverse(), [events]);
  return { located, status: 'Coordinate dei nodi · centro approssimativo del changeset per vie e relazioni' };
}
