import assert from 'node:assert/strict';
import test from 'node:test';
import { getNote, SCALES, NoteLimiter, DEFAULT_SCALE } from '../src/lib/music';
import { DEFAULT_SETTINGS, parseHash, settingsHash } from '../src/lib/settings';
import { normalizeEvent } from '../src/lib/events';

test('all nine scales map byte magnitude monotonically across three octaves', () => {
  const offsets: Record<string, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
  assert.equal(SCALES.length, 9);
  for (const scale of SCALES) {
    assert.equal(getNote(0, scale.id), 72 + offsets[scale.notes.at(-1)!]);
    assert.equal(getNote(10_000, scale.id), 48);
    assert.equal(getNote(100_000, scale.id), 48);
    let previous = Infinity;
    const used = new Set<number>();
    for (let bytes = 0; bytes <= 10_000; bytes++) {
      const note = getNote(bytes, scale.id);
      assert.ok(note <= previous);
      assert.ok(scale.notes.some(name => offsets[name] === note % 12));
      assert.equal(note, getNote(-bytes, scale.id));
      previous = note;
      used.add(note);
    }
    // Integer byte counts can skip a high note with logarithmic rounding.
    assert.ok(used.size >= scale.notes.length * 3 - 1);
  }
});
test('scale is shareable and invalid preferences use the default', () => {
  assert.equal(parseHash(settingsHash({ ...DEFAULT_SETTINGS, scale: 'dorian' })).scale, 'dorian');
  assert.equal(parseHash('#en,scale=major').scale, 'ionian');
  assert.equal(parseHash('#en,scale=minor').scale, 'aeolian');
  assert.equal(parseHash('#en,scale=invalid').scale, DEFAULT_SCALE);
});
test('new pages remain edits and are identified separately from welcomes', () => {
  const event = normalizeEvent({ server_name: 'en.wikipedia.org', type: 'new', namespace: 0, user: 'Editor', title: 'Page', length: { new: 200 } });
  assert.equal(event?.kind, 'edit');
  assert.equal(event?.newPage, true);
});
test('limiter allows quiet events, bounds a burst, and recovers after silence', () => {
  const limiter = new NoteLimiter();
  assert.ok(limiter.allow(0));
  assert.ok(limiter.allow(1));
  let played = 0;
  for (let i = 0; i < 100; i++) if (limiter.allow(2 + i / 100)) played++;
  assert.ok(played <= 12);
  assert.ok(limiter.allow(5));
});
