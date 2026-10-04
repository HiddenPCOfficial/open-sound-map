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
test('OSM stream emits immediately, deduplicates counts and closes stale connections', () => {
  const sources: FakeEventSource[] = [];
  class FakeEventSource {
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    status: ((event: { data: string }) => void) | null = null;
    closed = false;
    constructor(public url: string) { sources.push(this); }
    addEventListener(name: string, callback: (event: { data: string }) => void) {
      assert.equal(name, 'status'); this.status = callback;
    }
    close() { this.closed = true; }
    emit(payload: unknown) { this.onmessage!({ data: JSON.stringify(payload) }); }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
  Object.defineProperty(globalThis, 'EventSource', { value: FakeEventSource, configurable: true });
  const stream = new OpenStreetMapStream();
  try {
    const events: { id: string; delta: number }[] = [];
    const statuses: string[] = [];
    stream.connect(event => events.push(event), status => statuses.push(status));
    const source = sources[0];
    assert.equal(source.url, '/api/osm/stream');
    source.onopen!();
    source.emit(change);
    source.emit({ ...change, id: 13 });
    assert.equal(events.length, 2); // Both callbacks run synchronously, without pacing.
    source.emit(change);
    source.emit({ ...change, changes_count: 2 });
    source.emit({ ...change, changes_count: 7 });
    assert.equal(events.length, 3);
    assert.equal(events[2].delta, 3);
    source.onmessage!({ data: 'invalid JSON' });
    source.emit({ id: 'invalid' });
    assert.equal(events.length, 3);
    source.onerror!();
    source.status!({ data: 'connected' });
    assert.deepEqual(statuses, ['connecting', 'connected', 'reconnecting', 'connected']);
    stream.connect(event => { events.push(event); stream.close(); }, status => statuses.push(status));
    assert.equal(source.closed, true);
    const length = statuses.length;
    source.emit({ ...change, id: 14 });
    source.onerror!();
    assert.equal(events.length, 3);
    assert.equal(statuses.length, length);
    sources[1].emit(change);
    assert.equal(sources[1].closed, true);
    sources[1].emit({ ...change, id: 15 });
    assert.equal(events.length, 4);
  } finally {
    stream.close();
    if (previous) Object.defineProperty(globalThis, 'EventSource', previous);
    else Reflect.deleteProperty(globalThis, 'EventSource');
  }
});
