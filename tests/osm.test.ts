import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChangeset, normalizeOsmElement } from '../src/lib/osm';
import { OpenStreetMapStream } from '../src/services/OpenStreetMapStream';
const change = { elements: [{ type: 'node', id: 100, version: 1, changeset: 12, action: 'create', lat: 40, lon: 11 }, { type: 'way', id: 101, version: 2, changeset: 12, action: 'modify' }], id: 12, user: 'Mapper', changes_count: 4, min_lat: 40, max_lat: 42, min_lon: 10, max_lon: 12, tags: { comment: 'Buildings #survey' } };
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
test('OSM stream emits immediately, deduplicates object versions and closes stale connections', () => {
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
    source.emit({ ...change, id: 13, elements: [{ type: 'relation', id: 100, version: 1, changeset: 13, action: 'delete' }] });
    assert.equal(events.length, 3); // The transport emits actual objects; presentation has its own clock.
    source.emit(change);
    source.emit({ ...change, changes_count: 2 });
    source.emit({ ...change, changes_count: 7, elements: [...change.elements, { ...change.elements[0], version: 2, action: 'modify' }] });
    assert.equal(events.length, 4);
    assert.equal(events[2].delta, -1);
    assert.equal(events[3].delta, 1);
    assert.deepEqual(events.map(event => event.id), ['osm:node:100:1', 'osm:way:101:2', 'osm:relation:100:1', 'osm:node:100:2']);
    source.onmessage!({ data: 'invalid JSON' });
    source.emit({ id: 'invalid' });
    assert.equal(events.length, 4);
    source.onerror!();
    source.status!({ data: 'connected' });
    assert.deepEqual(statuses, ['connecting', 'connected', 'reconnecting', 'connected']);
    stream.connect(event => { events.push(event); stream.close(); }, status => statuses.push(status));
    assert.equal(source.closed, true);
    const length = statuses.length;
    source.emit({ ...change, id: 14 });
    source.onerror!();
    assert.equal(events.length, 4);
    assert.equal(statuses.length, length);
    sources[1].emit(change);
    assert.equal(sources[1].closed, true);
    sources[1].emit({ ...change, id: 15 });
    assert.equal(events.length, 5);
  } finally {
    stream.close();
    if (previous) Object.defineProperty(globalThis, 'EventSource', previous);
    else Reflect.deleteProperty(globalThis, 'EventSource');
  }
});

test('Each real object is normalized with its own identity, action, link and position', () => {
  const event = normalizeOsmElement(change.elements[0], change, 123)!;
  assert.equal(event.id, 'osm:node:100:1');
  assert.equal(event.delta, 1);
  assert.equal(event.receivedAt, 123);
  assert.deepEqual(event.location, { lat: 40, lon: 11 });
  assert.equal(event.changesetUrl, 'https://www.openstreetmap.org/changeset/12');
  assert.deepEqual(event.hashtags, ['survey']);
  assert.equal(normalizeOsmElement({ ...change.elements[0], changeset: 13 }, change), null);
  assert.equal(normalizeOsmElement({ ...change.elements[0], version: '1' }, change), null);
});
