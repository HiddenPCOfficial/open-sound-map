import assert from 'node:assert/strict';
import test from 'node:test';
import { resumePlayback } from '../src/lib/audio';

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
