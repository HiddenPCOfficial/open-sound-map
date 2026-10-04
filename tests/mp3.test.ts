import test from 'node:test';
import assert from 'node:assert/strict';
import { editDuration } from '../src/lib/mp3';
import { AudioEngine } from '../src/services/AudioEngine';
import type { WikiEvent } from '../src/types/wiki';
import { normalizeOsmElement } from '../src/lib/osm';
import { EventSequence } from '../src/services/EventSequence';

test('MP3 duration is bounded, monotonic and uses magnitude for removals', () => {
  const sizes = [0, 1, 10, 100, 1000, 10000, 100000];
  const durations = sizes.map(size => editDuration(size, 0.5, 5));
  assert.equal(durations[0], 0.5);
  assert.equal(durations.at(-1), 5);
  assert.ok(durations.every((value, i) => i === 0 || value >= durations[i - 1]));
  assert.equal(editDuration(-1000, 0.5, 5), editDuration(1000, 0.5, 5));
  assert.equal(editDuration(NaN, 0.5, 5), 0.5);
});

class Source {
  buffer: unknown;
  onended: (() => void) | null = null;
  args: number[] = [];
  stops: (number | undefined)[] = [];
  loop = false;
  connect() { return this; }
  disconnect() {}
  start(...args: number[]) { this.args = args; }
  stop(at?: number) { this.stops.push(at); }
}
class Context {
  currentTime = 0;
  state = 'running';
  destination = {};
  sampleRate = 44100;
  sources: Source[] = [];
  addEventListener() {} removeEventListener() {}
  createBuffer(channels: number, length: number) {
    return { numberOfChannels: channels, length, getChannelData: () => new Float32Array(length) };
  }
  createGain() {
    return { gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() { return this; }, disconnect() {} };
  }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  async decodeAudioData() { return { duration: 6 }; }
  async resume() {} async close() {}
}
function setup() {
  const originalContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  globalThis.AudioContext = Context as unknown as typeof AudioContext;
  globalThis.fetch = async () => new Response(new Uint8Array([1]));
  const engine = new AudioEngine();
  const internals = engine as unknown as { context: Context; addSynth: unknown };
  const notes: number[][] = [];
  const synth = { triggerAttackRelease(...args: number[]) { notes.push(args); }, releaseAll() {}, dispose() {} };
  return {
    engine, notes,
    get context() { return internals.context; },
    installSynth() { internals.addSynth = synth; },
    sources() { return internals.context.sources.filter(source => (source.buffer as { length?: number })?.length !== 1); },
    close() { engine.dispose(); globalThis.AudioContext = originalContext; globalThis.fetch = originalFetch; },
  };
}
const event = (delta = 10000) => ({ kind: 'edit', delta } as WikiEvent);

test('Three displayed objects trigger notes at their original edit intervals', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const audio = setup();
  const displayed: string[] = [];
  const sequence = new EventSequence(item => {
    displayed.push(item.id);
    audio.engine.play(item);
  }, 1);
  try {
    await audio.engine.enable();
    audio.installSynth();
    const changeset = { id: 12, changes_count: 3, user: 'Mapper' };
    for (const [id, type] of [[1, 'node'], [2, 'way'], [3, 'relation']] as const) {
      sequence.enqueue(normalizeOsmElement({ id, type, version: 1, changeset: 12, action: 'modify', timestamp: `2026-10-04T15:0${id + 5}:00Z` }, changeset)!);
    }
    assert.equal(displayed.length, 1);
    assert.equal(audio.notes.length, 1);
    audio.context.currentTime = 60;
    t.mock.timers.tick(60000);
    assert.equal(displayed.length, 2);
    assert.equal(audio.notes.length, 2);
    audio.context.currentTime = 120;
    t.mock.timers.tick(60000);
    assert.deepEqual(displayed, ['osm:node:1:1', 'osm:way:2:1', 'osm:relation:3:1']);
    assert.deepEqual(audio.notes.map(note => note[2]), [0.1, 60.1, 120.1]);
    assert.equal(new Set(audio.notes.map(note => note[0])).size, 3);
  } finally { sequence.close(); audio.close(); }
});

test('Short edit gaps remain shorter than note duration and no events are dropped', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const audio = setup();
  const sequence = new EventSequence(item => audio.engine.play(item), 1);
  try {
    await audio.engine.enable();
    audio.installSynth();
    for (let i = 0; i < 20; i++) sequence.enqueue({ ...event(i + 1), editedAt: i * 50, receivedAt: 0 });
    assert.equal(audio.notes.length, 1);
    for (let i = 1; i < 20; i++) {
      audio.context.currentTime = i * 0.05;
      t.mock.timers.tick(50);
      assert.equal(audio.notes.length, i + 1);
    }
    const gaps = audio.notes.slice(1).map((note, i) => note[2] - audio.notes[i][2]);
    assert.ok(gaps.every(gap => Math.abs(gap - 0.05) < 0.00001));
    sequence.enqueue({ ...event(100), editedAt: 10000, receivedAt: 0 });
    audio.context.currentTime = 10;
    t.mock.timers.tick(9050);
    assert.equal(audio.notes.length, 21);
    assert.equal(audio.notes[20][2], 10.1);
    sequence.enqueue({ ...event(), editedAt: 11000, receivedAt: 0 });
    sequence.close();
    audio.engine.stopSegment();
    audio.context.currentTime = 11;
    t.mock.timers.tick(1000);
    assert.equal(audio.notes.length, 21);
  } finally { sequence.close(); audio.close(); }
});

test('MP3 edits presented at adjacent times extend a source and resume at the actual pause position', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audio = setup();
  try {
    await audio.engine.selectSong('/song.mp3');
    audio.installSynth();
    audio.engine.play(event());
    const first = audio.sources()[0];
    assert.deepEqual(first.args, [0.1, 0]);
    assert.equal(first.loop, true);
    assert.equal(first.stops.at(-1), 5.1);
    audio.context.currentTime = 5;
    audio.engine.play(event());
    assert.equal(audio.sources().length, 1);
    assert.equal(first.stops.at(-1), 10.1);
    audio.context.currentTime = 10;
    audio.engine.play(event());
    assert.equal(audio.sources().length, 1);
    assert.equal(first.stops.at(-1), 15.1);
    assert.deepEqual(audio.notes.map(note => note[2]), [0.1, 5.1, 10.1]);
    audio.context.currentTime = 12.1;
    await audio.engine.selectSong(null);
    assert.equal(first.stops.at(-1), undefined);
    first.onended!();
    await audio.engine.selectSong('/song.mp3');
    audio.engine.play(event());
    const resumed = audio.sources()[1];
    assert.ok(Math.abs(resumed.args[1]) < 0.00001); // Twelve seconds into a six-second looping song.
    audio.engine.play({ kind: 'welcome' } as WikiEvent);
    assert.equal(audio.sources().length, 2);
    // Cancelling before the scheduled start must not skip an unheard segment.
    await audio.engine.selectSong(null);
    await audio.engine.selectSong('/song.mp3');
    audio.engine.play(event());
    assert.ok(Math.abs(audio.sources()[2].args[1]) < 0.00001);
    audio.engine.dispose();
    assert.equal(resumed.stops.at(-1), undefined);
  } finally { audio.close(); }
});

test('Overlapping MP3 edits share one source without delaying notes', async () => {
  const audio = setup();
  try {
    await audio.engine.selectSong('/song.mp3');
    audio.installSynth();
    audio.engine.play(event());
    audio.engine.play(event());
    assert.equal(audio.sources().length, 1);
    audio.context.currentTime = 1;
    audio.engine.play(event());
    assert.equal(audio.sources().length, 1);
    assert.equal(audio.sources()[0].stops.at(-1), 6.1);
    assert.deepEqual(audio.notes.map(note => note[2]), [0.1, 0.1, 1.1]);
    audio.context.currentTime = 2.1;
    await audio.engine.selectSong(null);
    await audio.engine.selectSong('/song.mp3');
    audio.engine.play(event());
    assert.equal(audio.sources()[1].args[1], 2);
  } finally { audio.close(); }
});

test('Country tracks retain submission order during loading', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audio = setup();
  try {
    await audio.engine.enable();
    audio.installSynth();
    const first = audio.engine.playLocation(event(), '/italy.mp3', 'dorian');
    const second = audio.engine.playLocation(event(), '/other.mp3', 'dorian');
    const third = audio.engine.playLocation(event(), '/italy.mp3', 'dorian');
    await first;
    assert.equal(audio.sources().length, 1);
    audio.context.currentTime = 5;
    t.mock.timers.tick(25);
    await second;
    audio.context.currentTime = 10;
    t.mock.timers.tick(25);
    await third;
    assert.deepEqual(audio.sources().map(source => source.args), [[0.1, 0], [5.1, 0], [10.1, 5]]);
    assert.deepEqual(audio.notes.map(note => note[2]), [0.1, 5.1, 10.1]);
  } finally { audio.close(); }
});
