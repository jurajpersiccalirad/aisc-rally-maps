import type { RingMP } from './bufferStage';
import type { LngLatAlt } from '../types';

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInMultiPoly(coord: LngLatAlt, mp: RingMP): boolean {
  const [x, y] = coord;
  for (const polygon of mp) {
    if (polygon.length === 0) continue;
    if (!pointInRing(x, y, polygon[0])) continue;
    let inHole = false;
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRing(x, y, polygon[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}
