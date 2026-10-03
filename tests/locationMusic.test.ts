import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countriesFromTopology, trackForLocation } from '../src/lib/locationMusic';

const countries = countriesFromTopology(JSON.parse(readFileSync('public/geo/countries-110m.json', 'utf8')));
test('Italian changesets select italy.mp3, including Sicily and Sardinia', () => {
  for (const location of [{ lat: 41.9, lon: 12.5 }, { lat: 45.46, lon: 9.19 }, { lat: 37.5, lon: 14 }, { lat: 40, lon: 9 }]) {
    assert.equal(trackForLocation(location, countries)?.url, '/location/italy.mp3');
  }
});
test('Unmapped countries, ocean and missing or invalid locations use notes', () => {
  for (const location of [undefined, { lat: 48.85, lon: 2.35 }, { lat: 0, lon: 0 }, { lat: NaN, lon: 12 }, { lat: 100, lon: 12 }]) {
    assert.equal(trackForLocation(location, countries), null);
  }
});
