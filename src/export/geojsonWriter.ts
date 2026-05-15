import { CATEGORY_META } from '../classify/categoryMeta';
import type { RingMP } from '../geometry/bufferStage';
import type { LngLatAlt, ParsedPoint, PointCategory } from '../types';

interface PolygonFeatureProps {
  name: string;
  lengthKm: number;
  bufferM: number;
  overlapsWith: string[];
}

export function stagePolygonGeoJson(
  mp: RingMP,
  props: PolygonFeatureProps,
): string {
  const geometry =
    mp.length === 1
      ? { type: 'Polygon' as const, coordinates: mp[0] }
      : { type: 'MultiPolygon' as const, coordinates: mp };
  return JSON.stringify(
    {
      type: 'Feature',
      geometry,
      properties: props,
    },
    null,
    2,
  );
}

interface CategorisedPoint {
  point: ParsedPoint;
  effectiveCategory: PointCategory;
  stageName: string | null;
}

interface EventCollectionInput {
  stages: Array<{
    name: string;
    mp: RingMP;
    lengthKm: number;
    bufferM: number;
    overlapsWith: string[];
    derivedLine: LngLatAlt[];
  }>;
  points: CategorisedPoint[];
}

export function eventGeoJson(input: EventCollectionInput): string {
  const features: unknown[] = [];

  for (const s of input.stages) {
    if (s.mp.length === 0) continue;
    const geometry =
      s.mp.length === 1
        ? { type: 'Polygon', coordinates: s.mp[0] }
        : { type: 'MultiPolygon', coordinates: s.mp };
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        kind: 'stage_buffer',
        name: s.name,
        lengthKm: s.lengthKm,
        bufferM: s.bufferM,
        overlapsWith: s.overlapsWith,
      },
    });
  }

  for (const s of input.stages) {
    if (s.derivedLine.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: s.derivedLine.map((c) => [c[0], c[1]]),
      },
      properties: {
        kind: 'stage_centerline',
        name: s.name,
      },
    });
  }

  for (const { point, effectiveCategory, stageName } of input.points) {
    const meta = CATEGORY_META[effectiveCategory];
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.coord[0], point.coord[1]],
      },
      properties: {
        kind: 'point',
        name: point.name || point.description || '',
        category: effectiveCategory,
        categoryLabel: meta.label,
        stage: stageName,
        styleColor: point.styleColorHex,
      },
    });
  }

  return JSON.stringify(
    { type: 'FeatureCollection', features },
    null,
    2,
  );
}
