import type { RingMP } from '../geometry/bufferStage';
import type { LngLatAlt } from '../types';

/**
 * `Number.prototype.toString` already emits the shortest unique
 * representation of an IEEE-754 double — that matches what shapely's
 * `wkt.dumps` produces for the reference Severn polygons (e.g.
 * `-3.4358950096271355 52.34692853990024`) and gives clean 7-decimal
 * KML-sourced values like `-3.4381498 52.3507264` without trailing zeros.
 */
function fmt(n: number): string {
  return n.toString();
}

function ring(pts: number[][]): string {
  return pts.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join(', ');
}

export function lineStringToWkt(coords: LngLatAlt[]): string {
  return `LINESTRING (${coords.map((c) => `${fmt(c[0])} ${fmt(c[1])}`).join(', ')})`;
}

/**
 * Emits a single POLYGON for a MultiPolygon-of-length-1, MULTIPOLYGON
 * otherwise. Matches the reference convention.
 */
export function multiPolygonToWkt(mp: RingMP): string {
  if (mp.length === 0) return 'MULTIPOLYGON EMPTY';
  if (mp.length === 1) {
    const rings = mp[0].map((r) => `(${ring(r)})`).join(', ');
    return `POLYGON (${rings})`;
  }
  const polys = mp
    .map((poly) => `(${poly.map((r) => `(${ring(r)})`).join(', ')})`)
    .join(', ');
  return `MULTIPOLYGON (${polys})`;
}

/**
 * Force MULTIPOLYGON wrapping regardless of polygon count — used for the
 * combined `<event>.wkt` which the reference Python pipeline always emits as
 * MULTIPOLYGON, and which the downstream AISC classifier expects.
 */
export function forceMultiPolygonToWkt(mp: RingMP): string {
  if (mp.length === 0) return 'MULTIPOLYGON EMPTY';
  const polys = mp
    .map((poly) => `(${poly.map((r) => `(${ring(r)})`).join(', ')})`)
    .join(', ');
  return `MULTIPOLYGON (${polys})`;
}
