import test from 'node:test';
import assert from 'node:assert/strict';
import { editDuration } from '../src/lib/mp3';
import { AudioEngine } from '../src/services/AudioEngine';
import type { WikiEvent } from '../src/types/wiki';

test('MP3 duration is bounded, monotonic and uses magnitude for removals', () => {
  const sizes = [0, 1, 10, 100, 1000, 10000, 100000];
  const durations = sizes.map(size => editDuration(size, 0.5, 5));
  assert.equal(durations[0], 0.5);
  assert.equal(durations.at(-1), 5);
  assert.ok(durations.every((value, i) => i === 0 || value >= durations[i - 1]));
  assert.equal(editDuration(-1000, 0.5, 5), editDuration(1000, 0.5, 5));
  assert.equal(editDuration(NaN, 0.5, 5), 0.5);
});

test('MP3 segments pause, resume, ignore overlapping edits, wrap and stop on selection', async () => {
  const sources: Source[] = [];
  class Source {
    buffer: unknown; onended: (() => void) | null = null;
    args: number[] = []; stopped = false;
    connect() { return this; } disconnect() {}
    start(...args: number[]) {
      this.args = args;
      // The one-frame unlock source is separate from audible MP3 segments.
      if ((this.buffer as { length?: number } | undefined)?.length !== 1) sources.push(this);
    }
    stop() { this.stopped = true; }
  }
  const gain = () => ({ gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this; }, disconnect() {} });
  class Context {
    currentTime = 0; state = 'running'; destination = {}; sampleRate = 44100;
    addEventListener() {} removeEventListener() {}
    createConvolver() { return { buffer: null, connect() { return this; }, disconnect() {} }; }
    createBuffer(channels: number, length: number) {
      return { numberOfChannels: channels, length, getChannelData: () => new Float32Array(length) };
    }
    createGain = gain;
    createBufferSource() { return new Source(); }
    async decodeAudioData() { return { duration: 6 }; }
    async resume() {} async close() {}
  }
  const originalContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  globalThis.AudioContext = Context as unknown as typeof AudioContext;
  globalThis.fetch = async () => new Response(new Uint8Array([1]));
  const engine = new AudioEngine();
  const event = { kind: 'edit', delta: 10000 } as WikiEvent;
  try {
    await engine.selectSong('/song.mp3');
    engine.play(event);
    assert.deepEqual(sources[0].args, [0, 0, 5]);
    engine.play(event);
    assert.equal(sources.length, 1);
    sources[0].onended!();
    engine.play(event);
    assert.deepEqual(sources[1].args, [0, 5, 1]);
    sources[1].onended!();
    engine.play(event);
    assert.deepEqual(sources[2].args, [0, 0, 5]);
    await engine.selectSong(null);
    assert.equal(sources[2].stopped, true);
    // Late callbacks from replaced sources must not change the new track.
    sources[2].onended!();
    await engine.selectSong('/other.mp3');
    engine.play({ kind: 'welcome' } as WikiEvent);
    // Welcome events do not produce audio, including with a selected music track.
    assert.equal(sources.length, 3);
    engine.play(event);
    engine.dispose();
    assert.equal(sources[3].stopped, true);
  } finally {
    engine.dispose(); globalThis.AudioContext = originalContext; globalThis.fetch = originalFetch;
  }
});
