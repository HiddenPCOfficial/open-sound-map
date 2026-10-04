import assert from 'node:assert/strict';
import test from 'node:test';
import { resumePlayback, unlockAudioContext } from '../src/lib/audio';

test('starts a silent source during the gesture to unlock Safari playback', () => {
  const calls: string[] = [];
  const destination = {};
  const buffer = {};
  const source = {
    buffer: null as unknown, onended: null as (() => void) | null,
    connect(node: unknown) { assert.equal(node, destination); calls.push('connect'); },
    start() { assert.equal(this.buffer, buffer); calls.push('start'); },
    disconnect() { calls.push('disconnect'); },
  };
  unlockAudioContext({
    destination, sampleRate: 44100,
    createBufferSource: () => source,
    createBuffer(channels: number, length: number, rate: number) {
      assert.deepEqual([channels, length, rate], [1, 1, 44100]);
      return buffer;
    },
  } as unknown as AudioContext);
  assert.deepEqual(calls, ['connect', 'start']);
  source.onended!();
  assert.deepEqual(calls, ['connect', 'start', 'disconnect']);
});

test('unlocks samples and synthesizers in the same gesture before either resume resolves', async () => {
  const calls: string[] = [];
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const samples = { state: 'suspended' as AudioContextState, resume: () => {
    calls.push('samples');
    return pending.then(() => { samples.state = 'running'; });
  } };
  const synth = { state: 'suspended' as AudioContextState, resume: async () => {
    calls.push('synth'); synth.state = 'running';
  } };
  const browser = { audioSession: { type: 'auto' } };
  const enabling = resumePlayback([samples, synth], browser);
  assert.deepEqual(calls, ['samples', 'synth']);
  assert.equal(browser.audioSession.type, 'playback');
  finish();
  await enabling;
});

test('does not report success if Safari leaves a context interrupted', async () => {
  await assert.rejects(resumePlayback([
    { state: 'running', resume: async () => {} },
    { state: 'interrupted' as AudioContextState, resume: async () => {} },
  ], {}), /suspended/);
});

test('works when the optional audio session API is unavailable or refuses configuration', async () => {
  const context = { state: 'running' as AudioContextState, resume: async () => {} };
  await resumePlayback([context], {});
  await resumePlayback([context], {
    audioSession: { get type() { return 'auto'; }, set type(_value: string) { throw new Error('Unsupported'); } },
  });
});

test('a stalled Safari resume allows the user to retry instead of loading forever', async () => {
  await assert.rejects(resumePlayback([
    { state: 'suspended', resume: () => new Promise<void>(() => {}) },
  ], {}, 1), /timed out/);
});
