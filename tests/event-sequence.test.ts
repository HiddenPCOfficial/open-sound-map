import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventSequence } from '../src/services/EventSequence';
import { normalizeOsmElement } from '../src/lib/osm';
import type { WikiEvent } from '../src/types/wiki';

function edit(id: number, timestamp?: string): WikiEvent {
  return normalizeOsmElement({ type: 'node', id, version: 1, action: 'modify', changeset: 12, timestamp }, { id: 12, changes_count: 3, user: 'Mapper' }, -10000)!;
}

test('Diagnostic logs expose the delta and remaining wait in seconds, without playback dates', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const logs = t.mock.method(console, 'info', () => {});
  const sequence = new EventSequence(() => {}, 0.25);
  sequence.enqueue(edit(1, '2026-10-04T15:06:00Z'));
  t.mock.timers.tick(10000);
  sequence.enqueue(edit(2, '2026-10-04T15:07:00Z'));
  const scheduled = logs.mock.calls.find(call => call.arguments[0] === '[EventSequence] Prossimo suono tra 5 secondi')!;
  assert.equal(scheduled.arguments[1].attesaResiduaSecondi, 5);
  assert.equal(scheduled.arguments[1].deltaSecondi, 60);
  assert.equal(scheduled.arguments[1].intervalloRiproduzioneSecondi, 15);
  assert.equal(scheduled.arguments[1].tempoTrascorsoSecondi, 10);
  assert.equal('riproduzionePrevistaIso' in scheduled.arguments[1], false);
  assert.equal(scheduled.arguments[1].eventiInCoda, 1);
  t.mock.timers.tick(5000);
  assert.match(logs.mock.calls.at(-1)!.arguments[0], /Nessun prossimo evento/);
  sequence.close();
});

test('Edit timestamp gaps are scaled by 0.25 even when received together', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const presented: WikiEvent[] = [];
  const sequence = new EventSequence(event => { presented.push(event); }, 0.25);
  sequence.enqueue(edit(1, '2026-10-04T15:06:00Z'));
  sequence.enqueue(edit(2, '2026-10-04T15:07:00Z'));
  sequence.enqueue(edit(3, '2026-10-04T15:07:02Z'));
  assert.equal(presented.length, 1);
  t.mock.timers.tick(14999);
  assert.equal(presented.length, 1);
  t.mock.timers.tick(1);
  assert.equal(presented.length, 2);
  t.mock.timers.tick(499);
  assert.equal(presented.length, 2);
  t.mock.timers.tick(1);
  assert.deepEqual(presented.map(item => item.receivedAt), [0, 15000, 15500]);
  assert.deepEqual(presented.map(item => item.observedAt), [-10000, -10000, -10000]);
  assert.equal(presented[1].editedAt, Date.parse('2026-10-04T15:07:00Z'));
  sequence.close();
});

test('New batches use the elapsed wait since the last presentation', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const presented: WikiEvent[] = [];
  const sequence = new EventSequence(event => { presented.push(event); }, 0.25);
  sequence.enqueue(edit(1, '2026-10-04T15:06:00Z'));
  t.mock.timers.tick(5000);
  sequence.enqueue(edit(2, '2026-10-04T15:07:00Z'));
  t.mock.timers.tick(9999);
  assert.equal(presented.length, 1);
  t.mock.timers.tick(1);
  assert.equal(presented[1].receivedAt, 15000);
  t.mock.timers.tick(10000);
  sequence.enqueue(edit(3, '2026-10-04T15:07:05Z'));
  assert.equal(presented[2].receivedAt, 25000);
  sequence.close();
});

test('Equal and out-of-order timestamps add no artificial delay', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const presented: WikiEvent[] = [];
  const sequence = new EventSequence(event => { presented.push(event); }, 0.25);
  sequence.enqueue(edit(1, '2026-10-04T15:06:00Z'));
  sequence.enqueue(edit(2, '2026-10-04T15:06:00Z'));
  sequence.enqueue(edit(3, '2026-10-04T15:05:59Z'));
  assert.equal(presented.length, 3);
  assert.deepEqual(presented.map(item => item.receivedAt), [0, 0, 0]);
  sequence.close();
});

test('Missing or invalid edit timestamps fall back to original arrival times', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const presented: WikiEvent[] = [];
  const sequence = new EventSequence(event => { presented.push(event); }, 0.25);
  sequence.enqueue({ ...edit(1), receivedAt: 1000 });
  sequence.enqueue({ ...edit(2, 'invalid'), receivedAt: 2000, observedAt: 1500 });
  t.mock.timers.tick(124);
  assert.equal(presented.length, 1);
  t.mock.timers.tick(1);
  assert.equal(presented[1].receivedAt, 125);
  assert.equal(presented[1].observedAt, 1500);
  sequence.close();
});

test('Closing cancels a pending edit and ignores further arrivals', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const presented: WikiEvent[] = [];
  const sequence = new EventSequence(event => { presented.push(event); }, 0.25);
  sequence.enqueue(edit(1, '2026-10-04T15:06:00Z'));
  sequence.enqueue(edit(2, '2026-10-04T15:07:00Z'));
  sequence.close();
  sequence.enqueue(edit(3));
  t.mock.timers.tick(120000);
  assert.equal(presented.length, 1);
});

test('A 254-second gap plays after 63.5 seconds', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(console, 'info', () => {});
  const presented: WikiEvent[] = [];
  const sequence = new EventSequence(event => { presented.push(event); }, 0.25);
  sequence.enqueue(edit(1, '2026-10-04T15:06:00Z'));
  sequence.enqueue(edit(2, '2026-10-04T15:10:14Z'));
  t.mock.timers.tick(63499);
  assert.equal(presented.length, 1);
  t.mock.timers.tick(1);
  assert.equal(presented[1].receivedAt, 63500);
  sequence.close();
});

test('Default scaling is 0.08 and changing it reschedules a pending event', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.mock.method(console, 'info', () => {});
  const presented: WikiEvent[] = [];
  const sequence = new EventSequence(event => { presented.push(event); });
  sequence.enqueue(edit(1, '2026-10-04T15:06:00Z'));
  sequence.enqueue(edit(2, '2026-10-04T15:07:00Z'));
  t.mock.timers.tick(4799);
  assert.equal(presented.length, 1);
  t.mock.timers.tick(1);
  assert.equal(presented[1].receivedAt, 4800);
  sequence.enqueue(edit(3, '2026-10-04T15:08:00Z'));
  t.mock.timers.tick(1000);
  sequence.setIntervalScale(0.25);
  t.mock.timers.tick(13999);
  assert.equal(presented.length, 2);
  t.mock.timers.tick(1);
  assert.equal(presented[2].receivedAt, 19800);
  sequence.enqueue(edit(4, '2026-10-04T15:09:00Z'));
  t.mock.timers.tick(5000);
  sequence.setIntervalScale(0.08);
  assert.equal(presented[3].receivedAt, 24800);
  t.mock.timers.tick(20000);
  assert.equal(presented.length, 4);
  sequence.close();
});
