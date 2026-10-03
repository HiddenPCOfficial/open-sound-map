import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChangeset } from '../src/lib/osm';
import { OpenStreetMapStream } from '../src/services/OpenStreetMapStream';
const change = { id: 12, user: 'Mapper', changes_count: 4, min_lat: 40, max_lat: 42, min_lon: 10, max_lon: 12, tags: { comment: 'Buildings #survey' } };
test('OSM changesets preserve map locations, links, counts and hashtags', () => {
  const event = normalizeChangeset(change, 100)!;
  assert.deepEqual(event.location, { lat: 41, lon: 11 });
  assert.equal(event.url, 'https://www.openstreetmap.org/changeset/12');
  assert.equal(event.delta, 4);
  assert.deepEqual(event.hashtags, ['survey']);
  assert.equal(normalizeChangeset({ ...change, changes_count: 0 }), null);
  assert.equal(normalizeChangeset({ ...change, id: '12' }), null);
  assert.equal(normalizeChangeset({ ...change, max_lat: 100 })!.location, undefined);
});
test('OSM stream uses the proxy and stops queued events on close', async () => {
  const previous = globalThis.fetch;
  const events: string[] = [];
  const statuses: string[] = [];
  globalThis.fetch = async input => {
    assert.equal(input, '/api/osm/changesets');
    return Response.json({ changesets: [{ ...change, id: 13 }, change] });
  };
  const stream = new OpenStreetMapStream();
  try {
    stream.connect(event => { events.push(event.id); stream.close(); }, status => statuses.push(status));
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(statuses, ['connecting', 'connected']);
    assert.deepEqual(events, ['osm:12:4']);
  } finally { stream.close(); globalThis.fetch = previous; }
});
