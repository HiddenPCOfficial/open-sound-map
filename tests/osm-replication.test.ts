import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseCursor, parseReplication, replicationPath, replicationEvents } from '../src/lib/osmReplication';
import { normalizeChangeset } from '../src/lib/osm';
import { GET } from '../src/app/api/osm/stream/route';

function xml(ids: number[]): string {
  return `<osm>${ids.map(id => `<changeset id="${id}" user="Mapper &amp; friend" num_changes="4" min_lat="40" max_lat="42" min_lon="10" max_lon="12"><tag k="comment" v="Buildings #survey &amp; roads"/></changeset>`).join('')}</osm>`;
}

test('Replication XML preserves string attributes, entities, bounds and empty files', () => {
  const [item] = parseReplication(xml([12]));
  const event = normalizeChangeset(item)!;
  assert.equal(event.user, 'Mapper & friend');
  assert.equal(event.title, 'Buildings #survey & roads');
  assert.equal(event.delta, 4);
  assert.deepEqual(event.location, { lat: 41, lon: 11 });
  assert.deepEqual(parseReplication('<osm/>'), []);
  const numericUser = parseReplication('<osm><changeset id="13" user="00123" num_changes="1"/></osm>')[0];
  assert.equal(numericUser.user, '00123');
  assert.equal(normalizeChangeset(numericUser)!.location, undefined);
  assert.throws(() => parseReplication('<osm><changeset></osm>'));
  assert.throws(() => parseReplication('<html/>'));
});

test('Replication cursors and paths are validated', () => {
  assert.equal(parseCursor(null), null);
  assert.deepEqual(parseCursor('7211593:5'), { sequence: 7211593, index: 5 });
  assert.equal(replicationPath(7211593), '007/211/593.osm.gz');
  for (const value of ['0:0', '-1:0', '../state.yaml', '12:-1', '12:9007199254740992']) {
    assert.throws(() => parseCursor(value));
  }
  assert.throws(() => replicationPath(NaN));
});

test('SSE resumes inside a file and delivers all intervening files, including over 100 events', async () => {
  const previous = globalThis.fetch;
  const requested: string[] = [];
  const ids = Array.from({ length: 120 }, (_, i) => i + 100);
  globalThis.fetch = async input => {
    const path = String(input).split('/').pop()!;
    requested.push(path);
    if (path === 'state.yaml') return new Response('---\nsequence: 1236\n');
    return new Response(gzipSync(xml(path === '234.osm.gz' ? [10, 11, 12] : path === '235.osm.gz' ? ids : [])));
  };
  const controller = new AbortController();
  const response = GET(new Request('http://localhost/api/osm/stream', {
    headers: { 'Last-Event-ID': '1234:2' }, signal: controller.signal,
  }));
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const messages: string[] = [];
  try {
    assert.match(response.headers.get('content-type')!, /text\/event-stream/);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    while (true) {
      const result = await reader.read();
      assert.equal(result.done, false);
      const chunk = decoder.decode(result.value);
      messages.push(chunk);
      if (chunk.includes('id: 1236:0')) break;
    }
    const events = messages.filter(message => message.includes('\ndata: {'));
    assert.equal(events.length, 121);
    assert.match(events[0], /id: 1234:3/);
    assert.match(events[0], /"id":12/);
    assert.match(events.at(-1)!, /id: 1235:120/);
    assert.deepEqual(requested, ['state.yaml', '234.osm.gz', '235.osm.gz', '236.osm.gz']);
    controller.abort();
    assert.equal((await reader.read()).done, true);
  } finally {
    await reader.cancel();
    globalThis.fetch = previous;
  }
});

test('First connection starts at the latest file and cancellation aborts an upstream request', async () => {
  const previous = globalThis.fetch;
  let upstreamSignal: AbortSignal | undefined;
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('state.yaml')) return new Response('sequence: 1234\n');
    assert.ok(String(input).endsWith('/000/001/234.osm.gz'));
    upstreamSignal = init!.signal!;
    markStarted();
    return new Promise((_, reject) => upstreamSignal!.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  };
  const reader = GET(new Request('http://localhost/api/osm/stream')).body!.getReader();
  try {
    await reader.read(); // Retry instruction.
    await reader.read(); // Connected status.
    const pending = reader.read();
    await started;
    assert.ok(upstreamSignal);
    await reader.cancel();
    assert.equal(upstreamSignal.aborted, true);
    assert.equal((await pending).done, true);
  } finally { await reader.cancel(); globalThis.fetch = previous; }
});

test('An unavailable upstream reports reconnecting and invalid cursors return 400', async () => {
  assert.equal(GET(new Request('http://localhost/api/osm/stream', { headers: { 'Last-Event-ID': '../1' } })).status, 400);
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 503 });
  const controller = new AbortController();
  const iterator = replicationEvents(null, controller.signal);
  try {
    assert.equal((await iterator.next()).value, 'event: status\ndata: reconnecting\n\n');
    const pending = iterator.next();
    controller.abort();
    assert.equal((await pending).done, true);
  } finally { await iterator.return(undefined); globalThis.fetch = previous; }
});
