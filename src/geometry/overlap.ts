import polygonClipping from 'polygon-clipping';
import type { RingMP } from './bufferStage';

type Geom = Parameters<typeof polygonClipping.union>[0];

/**
 * Returns the intersection MultiPolygon between two polygon-clipping shapes.
 * An empty result (length === 0) means they do not overlap.
 */
export function intersectionOf(a: RingMP, b: RingMP): RingMP {
  if (a.length === 0 || b.length === 0) return [];
  try {
    return polygonClipping.intersection(a as Geom, b as Geom) as RingMP;
  } catch {
    return [];
  }
}

export function overlaps(a: RingMP, b: RingMP): boolean {
  return intersectionOf(a, b).length > 0;
}
