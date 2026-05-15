import { buffer as turfBuffer, lineString } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { LngLatAlt } from '../types';

export type RingMP = number[][][][]; // MultiPolygon → polygon-clipping shape

/**
 * Buffer a stage centreline by `radiusM` meters. Mirrors the reference Python
 * pipeline (`gpx_to_aisc/main.py` lines 88–96): project to EPSG:3857
 * implicitly via turf's distance-aware buffer, then return a MultiPolygon as
 * nested arrays (polygon-clipping / GeoJSON-coordinates compatible).
 */
export function bufferStage(
  coords: LngLatAlt[],
  radiusM: number,
  steps = 8,
): RingMP | null {
  if (coords.length < 2 || radiusM <= 0) return null;
  const flat = coords.map((c) => [c[0], c[1]] as [number, number]);
  const buffered = turfBuffer(lineString(flat), radiusM, {
    units: 'meters',
    steps,
  });
  if (!buffered) return null;
  const geom = (buffered as Feature<Polygon | MultiPolygon>).geometry;
  if (geom.type === 'Polygon') {
    return [geom.coordinates as number[][][]];
  }
  return geom.coordinates as RingMP;
}
