/** Logarithmic duration keeps small edits audible and large edits bounded. */
export function editDuration(bytes: number, min: number, max: number): number {
  const size = Number.isFinite(bytes) ? Math.abs(bytes) : 0;
  return min + (max - min) * Math.min(1, Math.log1p(size) / Math.log1p(10_000));
}
export interface MusicTrack { id: string; name: string; url: string }
export const BUILTIN_TRACKS: MusicTrack[] = [];
