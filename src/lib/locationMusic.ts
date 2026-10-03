import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import type { MusicTrack } from './mp3';

export const LOCATION_MODE = 'location';
// Country IDs match the local world-atlas map (ISO 3166-1 numeric).
export const COUNTRY_TRACKS: Record<string, MusicTrack> = {
  '380': { id: 'italy', name: 'Luciano Pavarotti — Funiculì Funiculà · Italia', url: '/location/italy.mp3' },
};
export type Country = Feature<Polygon | MultiPolygon, object>;
export function countriesFromTopology(topology: Topology<{ countries: GeometryCollection }>): Country[] {
  return feature(topology, topology.objects.countries).features.filter((country): country is Country => country.geometry.type === 'Polygon' || country.geometry.type === 'MultiPolygon');
}
function inRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  // Unwrap around the query to handle countries crossing the date line.
  const longitude = (value: number) => lon + ((value - lon + 540) % 360) - 180;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x = longitude(ring[i][0]), y = ring[i][1];
    const px = longitude(ring[j][0]), py = ring[j][1];
    if ((y > lat) !== (py > lat) && lon < (px - x) * (lat - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}
export function trackForLocation(location: { lat: number; lon: number } | undefined, countries: Country[]): MusicTrack | null {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon) || Math.abs(location.lat) > 90 || Math.abs(location.lon) > 180) return null;
  for (const country of countries) {
    const track = COUNTRY_TRACKS[String(country.id)];
    if (!track) continue;
    const polygons = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
    if (polygons.some(rings => inRing(location.lon, location.lat, rings[0]) && !rings.slice(1).some(ring => inRing(location.lon, location.lat, ring)))) return track;
  }
  return null;
}
