import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WikimediaStream } from '../src/services/WikimediaStream';
import type { WikiEvent } from '../src/types/wiki';

test('stream reconnect states, validation and lifecycle do not leak connections', () => {
  const sources: FakeEventSource[] = [];
  class FakeEventSource {
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    closed = false;
    constructor(public url: string) { sources.push(this); }
    close() { this.closed = true; }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
  Object.defineProperty(globalThis, 'EventSource', { value: FakeEventSource, configurable: true });
  try {
    const service = new WikimediaStream();
    const statuses: string[] = [];
    const events: WikiEvent[] = [];
    service.connect(event => events.push(event), status => statuses.push(status));
    const source = sources[0];
    assert.equal(source.url, 'https://stream.wikimedia.org/v2/stream/recentchange');
    source.onopen!();
    source.onerror!();
    assert.deepEqual(statuses, ['connecting', 'connected', 'reconnecting']);
    source.onmessage!({ data: 'invalid JSON' });
    source.onmessage!({ data: JSON.stringify({ server_name: 'evil.com' }) });
    assert.equal(events.length, 0);
    source.onmessage!({ data: JSON.stringify({ id: 1, server_name: 'en.wikipedia.org', type: 'edit', namespace: 0, title: 'Example', user: 'Editor', length: { new: 12, old: 10 } }) });
    assert.equal(events[0].delta, 2);
    service.connect(() => {}, () => {});
    assert.equal(source.closed, true);
    service.close();
    assert.equal(sources[1].closed, true);
    service.close();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'EventSource', previous);
    else Reflect.deleteProperty(globalThis, 'EventSource');
  }
});
