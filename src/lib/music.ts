import type { WikiEvent } from '../types/wiki';

export const SCALES = [
  { id: 'ionian', name: 'Ionian (Major)', notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
  { id: 'dorian', name: 'Dorian', notes: ['C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'] },
  { id: 'phrygian', name: 'Phrygian', notes: ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'Bb'] },
  { id: 'lydian', name: 'Lydian', notes: ['C', 'D', 'E', 'F#', 'G', 'A', 'B'] },
  { id: 'mixolydian', name: 'Mixolydian', notes: ['C', 'D', 'E', 'F', 'G', 'A', 'Bb'] },
  { id: 'aeolian', name: 'Aeolian (Minor)', notes: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'] },
  { id: 'locrian', name: 'Locrian', notes: ['C', 'Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb'] },
  { id: 'major-pentatonic', name: 'Major Pentatonic', notes: ['C', 'D', 'E', 'G', 'A'] },
  { id: 'minor-pentatonic', name: 'Minor Pentatonic', notes: ['C', 'Eb', 'F', 'G', 'Bb'] },
] as const;
export type ScaleId = typeof SCALES[number]['id'];
export const DEFAULT_SCALE: ScaleId = 'major-pentatonic';
export const MAX_EDIT_BYTES = 10_000;
export function isScaleId(value: string): value is ScaleId {
  return SCALES.some(scale => scale.id === value);
}
function scaleNotes(scale: ScaleId): number[] {
  const offsets = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 } as const;
  const selected = SCALES.find(item => item.id === scale)!;
  return [48, 60, 72].flatMap(root => selected.notes.map(note => root + offsets[note]));
}
/** MIDI notes, ascending across C3–B5; byte magnitude alone selects pitch. */
export function getNote(deltaBytes: number, scale: ScaleId): number {
  const notes = scaleNotes(scale);
  const size = Number.isFinite(deltaBytes) ? Math.abs(deltaBytes) : MAX_EDIT_BYTES;
  const normalized = Math.min(1, Math.log1p(size) / Math.log1p(MAX_EDIT_BYTES));
  return notes[Math.round((1 - normalized) * (notes.length - 1))];
}

/** Deterministic sonification of real edits, including changes between neighbours. */
export function getEditSound(event: WikiEvent, scale: ScaleId, previous?: WikiEvent, previousMidi?: number) {
  const selected = SCALES.find(item => item.id === scale)!;
  const notes = scaleNotes(scale);
  const magnitude = (value: number) => Number.isFinite(value) ? Math.log1p(Math.min(MAX_EDIT_BYTES, Math.abs(value))) / Math.log1p(MAX_EDIT_BYTES) : 0;
  const size = magnitude(event.delta);
  const action = event.osm?.action ?? (event.newPage ? 'create' : event.delta < 0 ? 'delete' : 'modify');
  const direction = action === 'delete' ? -1 : 1;
  const actionStep = action === 'create' ? 3 : action === 'delete' ? -3 : 0;
  const objectStep = event.osm?.type === 'way' ? -2 : event.osm?.type === 'relation' ? -4 : 0;
  const arrived = event.observedAt ?? event.receivedAt;
  const prior = previous && (previous.observedAt ?? previous.receivedAt);
  const gap = previous && Number.isFinite(arrived) && Number.isFinite(prior) ? Math.max(0, arrived - prior!) / 1000 : 0;
  const timeDelta = Math.min(1, Math.log1p(gap) / Math.log1p(30));
  let distance = 0;
  if (event.location && previous?.location) {
    const radians = Math.PI / 180;
    const a = Math.sin((event.location.lat - previous.location.lat) * radians / 2) ** 2
      + Math.cos(event.location.lat * radians) * Math.cos(previous.location.lat * radians)
      * Math.sin((event.location.lon - previous.location.lon) * radians / 2) ** 2;
    const km = 12742 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
    distance = Number.isFinite(km) ? Math.min(1, Math.log1p(km) / Math.log1p(20000)) : 0;
  }
  const deltaStep = previous ? Math.round((size - magnitude(previous.delta)) * selected.notes.length) : 0;
  const base = event.osm ? Math.round((1 - size) * (notes.length - 1) * 0.65) : notes.indexOf(getNote(event.delta, scale));
  let index = Math.max(0, Math.min(notes.length - 1, base + actionStep + objectStep + deltaStep + direction * Math.round(timeDelta * 3 + distance * 4)));
  // Consecutive equal-sized objects still articulate a small melodic movement.
  if (notes[index] === previousMidi) index += index === 0 ? 1 : index === notes.length - 1 ? -1 : direction;
  const interval = 0.18 + size * 0.32 + timeDelta * 0.45 + distance * 0.2
    + (action === 'create' ? 0.12 : action === 'delete' ? 0.04 : 0)
    + (event.osm?.type === 'relation' ? 0.12 : event.osm?.type === 'way' ? 0.06 : 0);
  return {
    midi: notes[index],
    interval,
    duration: Math.min(0.8, interval * (action === 'delete' ? 0.4 : 0.75)),
    velocity: event.bot ? 0.28 : Math.min(0.9, 0.48 + size * 0.2 + distance * 0.08 + (action === 'create' ? 0.12 : 0)),
    removal: action === 'delete',
  };
}
/** Limit bursts without queuing stale notes; quiet activity remains unrestricted. */
export class NoteLimiter {
  private times: number[] = [];
  private last = -Infinity;
  allow(now: number): boolean {
    this.times = this.times.filter(time => now - time < 1);
    this.times.push(now);
    const interval = this.times.length > 12 ? 0.2 : this.times.length > 6 ? 0.125 : 0;
    if (now - this.last < interval) return false;
    this.last = now;
    return true;
  }
}
