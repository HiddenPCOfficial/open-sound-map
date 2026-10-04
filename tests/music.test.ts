import assert from 'node:assert/strict';
import test from 'node:test';
import { getNote, getEditSound, SCALES, NoteLimiter, DEFAULT_SCALE } from '../src/lib/music';
import { normalizeOsmElement } from '../src/lib/osm';
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

const mapEdit = () => normalizeOsmElement({ type: 'node', id: 1, version: 2, changeset: 12, action: 'modify', lat: 41, lon: 12 }, { id: 12, changes_count: 1, user: 'Mapper' }, 1000)!;

test('action and object type distinguish edits with the same delta', () => {
  const event = mapEdit();
  const variants = ['create', 'modify', 'delete'].map(action => getEditSound({ ...event, osm: { ...event.osm!, action: action as 'create' | 'modify' | 'delete' } }, DEFAULT_SCALE));
  assert.equal(new Set(variants.map(sound => sound.midi)).size, 3);
  assert.equal(variants[2].removal, true);
  assert.ok(variants[0].duration > variants[2].duration);
  const types = ['node', 'way', 'relation'].map(type => getEditSound({ ...event, osm: { ...event.osm!, type: type as 'node' | 'way' | 'relation' } }, DEFAULT_SCALE));
  assert.equal(new Set(types.map(sound => sound.midi)).size, 3);
});

test('time, geographical distance and delta changes affect neighbouring edits', () => {
  const previous = mapEdit();
  const nearby = { ...previous, observedAt: 1100, receivedAt: 50000 };
  const baseline = getEditSound(nearby, DEFAULT_SCALE, previous);
  const late = getEditSound({ ...nearby, observedAt: 31000 }, DEFAULT_SCALE, previous);
  const far = getEditSound({ ...nearby, location: { lat: -33, lon: 151 } }, DEFAULT_SCALE, previous);
  assert.notEqual(baseline.midi, late.midi);
  assert.notEqual(baseline.midi, far.midi);
  assert.ok(late.interval > baseline.interval);
  assert.ok(far.interval > baseline.interval);
  assert.deepEqual(baseline, getEditSound({ ...nearby, receivedAt: 999999 }, DEFAULT_SCALE, previous));
  assert.notEqual(baseline.midi, getEditSound(nearby, DEFAULT_SCALE, { ...previous, delta: 10000 }).midi);
});

test('repeated notes move within every selected scale and invalid deltas stay bounded', () => {
  const event = mapEdit();
  for (const scale of SCALES) {
    const first = getEditSound(event, scale.id);
    const repeated = getEditSound(event, scale.id, event, first.midi);
    assert.notEqual(first.midi, repeated.midi);
    for (const delta of [NaN, Infinity, -100000, 0, 100000]) {
      const sound = getEditSound({ ...event, delta }, scale.id, event);
      assert.ok(Number.isFinite(sound.midi));
      assert.ok(sound.interval >= 0.18 && sound.interval <= 1.5);
      assert.ok(sound.velocity > 0 && sound.velocity <= 0.9);
      assert.equal(getNote(0, scale.id) >= sound.midi && sound.midi >= 48, true);
    }
  }
});
