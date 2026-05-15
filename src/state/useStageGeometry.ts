import { useMemo } from 'react';
import { bufferStage, type RingMP } from '../geometry/bufferStage';
import { intersectionOf } from '../geometry/overlap';
import { repairPolygon } from '../geometry/repairPolygon';
import { getStageDerivedGeometry } from './selectors';
import { useProject } from './useProject';

// Note: an earlier draft included `findNonOverlappingBufferRadius` here as an
// "auto-shrink" helper. It was removed — stage overlaps are legitimate (e.g.
// Severn SS7 reuses SS3/SS4 roads). The combined `<event>.wkt` MULTIPOLYGON
// produced at export time runs `polygonClipping.union(...)` over every
// stage's repaired buffer, which dissolves overlaps into a single
// topologically valid MultiPolygon that shapely.contains() can use.

export interface StageGeometry {
  buffered: Map<string, RingMP>;
  /** stageId → list of other stage ids whose buffer it intersects. */
  overlapsFor: Map<string, string[]>;
  /** Per pair: the overlapping region. Each pair appears once (a < b). */
  intersections: Array<{ a: string; b: string; region: RingMP }>;
}

/**
 * Computes buffered + repaired polygons for every stage and the pairwise
 * overlap map. Memoised on the full project state, so any reducer dispatch
 * triggers a recompute — fine for a few dozen stages, slow beyond that.
 */
export function useStageGeometry(): StageGeometry {
  const state = useProject();
  return useMemo(() => {
    const buffered = new Map<string, RingMP>();
    for (const s of state.stages) {
      const coords = getStageDerivedGeometry(state, s.id);
      if (!coords || coords.length < 2) continue;
      const raw = bufferStage(coords, s.bufferRadiusM);
      if (!raw) continue;
      buffered.set(s.id, repairPolygon(raw));
    }

    const overlapsFor = new Map<string, string[]>();
    const intersections: Array<{ a: string; b: string; region: RingMP }> = [];
    const ids = Array.from(buffered.keys());
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const region = intersectionOf(buffered.get(a)!, buffered.get(b)!);
        if (region.length > 0) {
          if (!overlapsFor.has(a)) overlapsFor.set(a, []);
          if (!overlapsFor.has(b)) overlapsFor.set(b, []);
          overlapsFor.get(a)!.push(b);
          overlapsFor.get(b)!.push(a);
          intersections.push({ a, b, region });
        }
      }
    }
    return { buffered, overlapsFor, intersections };
  }, [state]);
}

