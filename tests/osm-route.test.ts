import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../src/app/api/osm/changesets/route';

test('Italian changesets outside the global batch survive; duplicates use the latest count', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.searchParams.has('bbox')) {
      assert.equal(url.searchParams.get('bbox'), '6.6,35.4,18.6,47.2');
      assert.ok(Date.now() - Date.parse(url.searchParams.get('time')!) < 615000);
      return Response.json({ changesets: [{ id: 10, changes_count: 3 }, { id: 12, changes_count: 6 }] });
    }
    return Response.json({ changesets: [{ id: 12, changes_count: 4 }, { id: 13, changes_count: 1 }] });
  };
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).changesets, [
      { id: 13, changes_count: 1 }, { id: 12, changes_count: 6 }, { id: 10, changes_count: 3 },
    ]);
  } finally { globalThis.fetch = previous; }
});

test('One unavailable feed does not interrupt the other; both unavailable return 502', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async input => {
    if (String(input).includes('bbox=')) throw new Error('Unavailable');
    return Response.json({ changesets: [{ id: 13, changes_count: 1 }] });
  };
  try {
    assert.equal((await GET()).status, 200);
    globalThis.fetch = async () => { throw new Error('Unavailable'); };
    assert.equal((await GET()).status, 502);
  } finally { globalThis.fetch = previous; }
});
