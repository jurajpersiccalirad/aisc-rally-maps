import type { RingMP } from '../geometry/bufferStage';

export function stagePolygonGeoJson(mp: RingMP): string {
  const geometry =
    mp.length === 1
      ? { type: 'Polygon' as const, coordinates: mp[0] }
      : { type: 'MultiPolygon' as const, coordinates: mp };
  return JSON.stringify(geometry, null, 2);
}
