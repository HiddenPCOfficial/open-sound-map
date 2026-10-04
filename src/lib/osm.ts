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

/** One real object version from a changeset download, not a synthetic count. */
export function normalizeOsmElement(payload: unknown, changeset: unknown, now = Date.now()): WikiEvent | null {
  const base = normalizeChangeset(changeset, now);
  if (!base || !payload || typeof payload !== 'object') return null;
  const item = payload as Record<string, unknown>;
  if (!['node', 'way', 'relation'].includes(String(item.type)) || !['create', 'modify', 'delete'].includes(String(item.action))) return null;
  for (const value of [item.id, item.version, item.changeset]) if (!Number.isSafeInteger(value) || Number(value) <= 0) return null;
  if (item.changeset !== (changeset as { id: number }).id) return null;
  const tags = item.tags && typeof item.tags === 'object' ? item.tags as Record<string, unknown> : {};
  const label = typeof tags.name === 'string' ? tags.name : `${item.type} #${item.id}`;
  const timestamp = typeof item.timestamp === 'string' ? Date.parse(item.timestamp) : NaN;
  const validLocation = typeof item.lat === 'number' && typeof item.lon === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lon) && Math.abs(item.lat) <= 90 && Math.abs(item.lon) <= 180;
  return {
    ...base, id: `osm:${item.type}:${item.id}:${item.version}`,
    editedAt: Number.isFinite(timestamp) ? timestamp : undefined,
    title: `${label} · ${base.title}`, user: typeof item.user === 'string' ? item.user : base.user,
    url: `https://www.openstreetmap.org/${item.type}/${item.id}/history/${item.version}`,
    changesetUrl: base.url, userUrl: `https://www.openstreetmap.org/user/${encodeURIComponent(typeof item.user === 'string' ? item.user : base.user)}`,
    delta: item.action === 'delete' ? -1 : 1, newPage: item.action === 'create',
    osm: { type: item.type as 'node' | 'way' | 'relation', id: Number(item.id), version: Number(item.version), changesetId: Number(item.changeset), action: item.action as 'create' | 'modify' | 'delete' },
    location: validLocation ? { lat: Number(item.lat), lon: Number(item.lon) } : base.location,
  };
}
