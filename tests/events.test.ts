import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articlePosition, editRadius, matchesTags, normalizeEvent } from '../src/lib/events';
import { DEFAULT_SETTINGS, parseHash, parseTags, settingsHash } from '../src/lib/settings';

const payload = { id: 123, server_name: 'it.wikipedia.org', type: 'edit', namespace: 0, title: 'Roma', user: 'Alice', length: { old: 100, new: 145 }, comment: 'Undo #Arte #SCIENZA', anon: true };
test('normalizes real edits and derives safe URLs and hashtags', () => {
  const event = normalizeEvent(payload, 1000)!;
  assert.equal(event.delta, 45);
  assert.equal(event.language, 'it');
  assert.equal(event.anonymous, true);
  assert.equal(event.reverted, true);
  assert.deepEqual(event.hashtags, ['arte', 'scienza']);
  assert.equal(event.url, 'https://it.wikipedia.org/wiki/Roma');
  assert.equal(event.receivedAt, 1000);
  assert.equal(matchesTags(event, ['arte']), true);
  assert.equal(matchesTags(event, ['musica']), false);
});
test('rejects untrusted hosts, malformed payloads and non-article events', () => {
  for (const value of [null, {}, { ...payload, server_name: 'evil.com' }, { ...payload, server_name: 'it.wikipedia.org.evil.com' }, { ...payload, length: { new: NaN, old: 1 } }, { ...payload, length: undefined }, { ...payload, namespace: 1 }, { ...payload, user: 42 }]) assert.equal(normalizeEvent(value), null);
});
test('supports new pages, byte removals and Wikidata', () => {
  assert.equal(normalizeEvent({ ...payload, type: 'new', length: { new: 200 } })!.delta, 200);
  assert.equal(normalizeEvent({ ...payload, length: { old: 100, new: 10 } })!.delta, -90);
  assert.equal(normalizeEvent({ ...payload, server_name: 'www.wikidata.org' })!.language, 'wikidata');
});
test('only newuser create logs trigger welcome events', () => {
  const value = { ...payload, type: 'log', log_type: 'newusers', log_action: 'create', length: undefined };
  const event = normalizeEvent(value)!;
  assert.equal(event.kind, 'welcome');
  assert.match(event.url, /User_talk/);
  assert.equal(normalizeEvent({ ...value, log_action: 'byemail' }), null);
});
test('encodes article titles and user names without injecting markup', () => {
  const event = normalizeEvent({ ...payload, title: '<script>alert(1)</script>', user: 'A&B' })!;
  assert.ok(!event.url.includes('<'));
  assert.ok(event.userUrl.includes('A%26B'));
});
test('keeps article positions deterministic and circle sizes bounded', () => {
  assert.deepEqual(articlePosition('Roma'), articlePosition('Roma'));
  for (const coordinate of articlePosition('Roma')) assert.ok(coordinate > 0 && coordinate < 1);
  assert.equal(editRadius(0), 3);
  assert.equal(editRadius(-100), editRadius(100));
  assert.equal(editRadius(1e10), 150);
});
test('supports original hash settings and normalizes tags', () => {
  assert.deepEqual(parseTags('#Arte, arte SCIENZA'), ['arte', 'scienza']);
  assert.deepEqual(parseHash('#it,en,notitles,nowelcomes'), { scale: 'major-pentatonic', intervalScale: 0.08, languages: ['it', 'en'], hideTitles: true, hideWelcomes: true });
  assert.deepEqual(parseHash('#unknown').languages, ['en']);
  assert.equal(settingsHash({ ...DEFAULT_SETTINGS, languages: ['it'], hideTitles: true }), '#it,scale=major-pentatonic,intervalScale=0.08,notitles');
  assert.deepEqual(parseHash(settingsHash({ ...DEFAULT_SETTINGS, languages: [] })).languages, []);
});
test('preserves exact revision IDs and rejects invalid revision values', () => {
  const event = normalizeEvent({ ...payload, revision: { old: 1234, new: 1235 } })!;
  assert.equal(event.previousRevisionId, 1234);
  assert.equal(event.revisionId, 1235);
  const newPage = normalizeEvent({ ...payload, type: 'new', revision: { old: 0, new: 1235 } })!;
  assert.equal(newPage.previousRevisionId, undefined);
  assert.equal(newPage.revisionId, 1235);
  const invalid = normalizeEvent({ ...payload, revision: { old: -1, new: '1235' } })!;
  assert.equal(invalid.previousRevisionId, undefined);
  assert.equal(invalid.revisionId, undefined);
});

test('Interval scaling survives URL sharing and invalid values use 0.08', () => {
  assert.equal(parseHash(settingsHash({ ...DEFAULT_SETTINGS, intervalScale: 0.25 })).intervalScale, 0.25);
  for (const value of ['', '0', '-1', 'NaN', 'Infinity', '11']) {
    assert.equal(parseHash('#intervalScale=' + value).intervalScale, 0.08);
  }
});
