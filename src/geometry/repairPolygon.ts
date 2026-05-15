import polygonClipping from 'polygon-clipping';
import type { RingMP } from './bufferStage';

type Geom = Parameters<typeof polygonClipping.union>[0];

/**
 * Run a `union` of the polygon with itself — equivalent to shapely's
 * `buffer(0)` trick. polygon-clipping's union algorithm internally cleans
 * self-intersections, so this returns a topologically valid MultiPolygon.
 *
 * Replicates `tests/check_wkt_gpx.py:254-263` from the original CLI side
 * tool.
 */
export function repairPolygon(mp: RingMP): RingMP {
  if (mp.length === 0) return mp;
  try {
    const cleaned = polygonClipping.union(mp as Geom);
    return cleaned as RingMP;
  } catch {
    return mp;
  }
}
