import type { WikiEvent } from '../types/wiki';

/** A changeset is a group of map edits, positioned at its bounding-box centre. */
export function normalizeChangeset(payload: unknown, now = Date.now()): WikiEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const c = payload as Record<string, unknown>;
  if (!Number.isSafeInteger(c.id) || Number(c.id) <= 0 || typeof c.user !== 'string' || !Number.isSafeInteger(c.changes_count) || Number(c.changes_count) <= 0) return null;
  const tags = c.tags && typeof c.tags === 'object' ? c.tags as Record<string, unknown> : {};
  const comment = typeof tags.comment === 'string' ? tags.comment : '';
  const bounds = [c.min_lat, c.max_lat, c.min_lon, c.max_lon];
  const valid = bounds.every(v => typeof v === 'number' && Number.isFinite(v)) && Math.abs(Number(c.min_lat)) <= 90 && Math.abs(Number(c.max_lat)) <= 90 && Math.abs(Number(c.min_lon)) <= 180 && Math.abs(Number(c.max_lon)) <= 180 && Number(c.min_lat) <= Number(c.max_lat) && Number(c.min_lon) <= Number(c.max_lon);
  return { id: `osm:${c.id}:${c.changes_count}`, kind: 'edit', language: 'osm', title: comment || `Changeset #${c.id}`, user: c.user,
    url: `https://www.openstreetmap.org/changeset/${c.id}`, userUrl: `https://www.openstreetmap.org/user/${encodeURIComponent(c.user)}`,
    delta: Number(c.changes_count), anonymous: false, bot: tags.bot === 'yes', reverted: /revert|undo/i.test(comment),
    hashtags: [...`${comment} ${typeof tags.hashtags === 'string' ? tags.hashtags : ''}`.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map(m => m[1].toLowerCase()), receivedAt: now,
    location: valid ? { lat: (Number(c.min_lat) + Number(c.max_lat)) / 2, lon: (Number(c.min_lon) + Number(c.max_lon)) / 2 } : undefined,
  };
}
