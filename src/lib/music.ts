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
/** MIDI notes, ascending across C3–B5; byte magnitude alone selects pitch. */
export function getNote(deltaBytes: number, scale: ScaleId): number {
  const offsets = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 } as const;
  const selected = SCALES.find(item => item.id === scale)!;
  const notes = [48, 60, 72].flatMap(root => selected.notes.map(note => root + offsets[note]));
  const size = Number.isFinite(deltaBytes) ? Math.abs(deltaBytes) : MAX_EDIT_BYTES;
  const normalized = Math.min(1, Math.log1p(size) / Math.log1p(MAX_EDIT_BYTES));
  return notes[Math.round((1 - normalized) * (notes.length - 1))];
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
