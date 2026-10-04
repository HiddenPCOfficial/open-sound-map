import { gunzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const baseUrl = 'https://planet.openstreetmap.org/replication/changesets';
const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false,
  isArray: name => name === 'changeset' || name === 'tag',
});
const elementParser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false,
  isArray: name => ['create', 'modify', 'delete', 'node', 'way', 'relation', 'tag'].includes(name),
});

export function parseChangesetElements(xml: string): Record<string, unknown>[] {
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid osmChange XML');
  const root = elementParser.parse(xml).osmChange;
  if (root === '') return [];
  if (!root || typeof root !== 'object') throw new Error('Invalid osmChange document');
  const elements: Record<string, unknown>[] = [];
  for (const action of ['create', 'modify', 'delete']) {
    for (const section of root[action] ?? []) {
      for (const type of ['node', 'way', 'relation']) {
        for (const item of section[type] ?? []) {
          elements.push({ type, action, id: Number(item.id), version: Number(item.version), changeset: Number(item.changeset), user: item.user, timestamp: item.timestamp,
            lat: item.lat === undefined ? undefined : Number(item.lat), lon: item.lon === undefined ? undefined : Number(item.lon),
            tags: Object.fromEntries((item.tag ?? []).map((tag: { k: string; v: string }) => [tag.k, tag.v])),
          });
        }
      }
    }
  }
  // osmChange groups by action and object type, rather than edit time.
  return elements.sort((a, b) => {
    const first = typeof a.timestamp === 'string' ? Date.parse(a.timestamp) : NaN;
    const second = typeof b.timestamp === 'string' ? Date.parse(b.timestamp) : NaN;
    if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : 0;
    if (!Number.isFinite(second)) return -1;
    return first - second;
  });
}

async function changesetElements(id: number, signal: AbortSignal): Promise<Record<string, unknown>[]> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid changeset ID');
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/changeset/${id}/download`, {
    headers: { 'User-Agent': 'ListenToOpenStreetMap/1.0' }, cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error('OSM objects unavailable');
  return parseChangesetElements(await response.text());
}

export type ReplicationCursor = { sequence: number; index: number };

export function parseCursor(value: string | null): ReplicationCursor | null {
  if (!value) return null;
  const match = /^(\d{1,9}):(\d+)$/.exec(value);
  if (!match) throw new Error('Invalid replication cursor');
  const sequence = Number(match[1]);
  const index = Number(match[2]);
  if (sequence < 1 || !Number.isSafeInteger(index) || index < 0) throw new Error('Invalid replication cursor');
  return { sequence, index };
}

export function replicationPath(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999999) throw new Error('Invalid sequence');
  return sequence.toString().padStart(9, '0').match(/.{3}/g)!.join('/') + '.osm.gz';
}

export function parseReplication(xml: string): Record<string, unknown>[] {
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid replication XML');
  const document = parser.parse(xml);
  if (document.osm === '') return [];
  if (!document.osm || typeof document.osm !== 'object') throw new Error('Invalid replication document');
  return (document.osm.changeset ?? []).map((item: Record<string, unknown>) => ({
    id: Number(item.id), user: item.user, changes_count: Number(item.num_changes),
    min_lat: item.min_lat === undefined ? undefined : Number(item.min_lat),
    max_lat: item.max_lat === undefined ? undefined : Number(item.max_lat),
    min_lon: item.min_lon === undefined ? undefined : Number(item.min_lon),
    max_lon: item.max_lon === undefined ? undefined : Number(item.max_lon),
    tags: Object.fromEntries((item.tag as { k: string; v: string }[] ?? []).map(tag => [tag.k, tag.v])),
  }));
}

async function load(path: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(`${baseUrl}/${path}`, {
    headers: { 'User-Agent': 'ListenToOpenStreetMap/1.0' }, cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error('OSM replication unavailable');
  return response;
}

/** OSM publishes files, not a push API. Only this server checks for new files. */
export async function* replicationEvents(cursor: ReplicationCursor | null, signal: AbortSignal): AsyncGenerator<string> {
  let sequence = cursor?.sequence;
  let index = cursor?.index ?? 0;
  while (!signal.aborted) {
    try {
      const state = await (await load('state.yaml', signal)).text();
      const latest = Number(/^sequence:\s*(\d+)\s*$/m.exec(state)?.[1]);
      replicationPath(latest);
      sequence ??= latest;
      if (sequence > latest + 1) throw new Error('Replication cursor ahead of upstream');
      yield 'event: status\ndata: connected\n\n';
      // Consume every intervening file, rather than the API's latest 100 results.
      while (sequence <= latest && !signal.aborted) {
        const response = await load(replicationPath(sequence), signal);
        const xml = gunzipSync(Buffer.from(await response.arrayBuffer()), { maxOutputLength: 32 * 1024 * 1024 }).toString('utf8');
        const changesets = parseReplication(xml);
        if (index > changesets.length) throw new Error('Invalid replication offset');
        while (index < changesets.length && !signal.aborted) {
          const changeset = changesets[index];
          // Advance only after the object download succeeds, so failures are retried.
          const elements = Number(changeset.changes_count) > 0 ? await changesetElements(Number(changeset.id), signal) : [];
          if (signal.aborted) return;
          index++;
          yield `id: ${sequence}:${index}\ndata: ${JSON.stringify({ ...changeset, elements })}\n\n`;
        }
        // Also checkpoint empty files. The browser sends this ID on reconnect.
        yield `id: ${sequence}:${index}\nevent: checkpoint\ndata: complete\n\n`;
        sequence++;
        index = 0;
      }
    } catch {
      if (signal.aborted) return;
      yield 'event: status\ndata: reconnecting\n\n';
    }
    try { await delay(10000, undefined, { signal }); } catch { return; }
    if (!signal.aborted) yield ': keep-alive\n\n';
  }
}
