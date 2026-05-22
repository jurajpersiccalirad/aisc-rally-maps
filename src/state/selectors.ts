import {
  distance as turfDistance,
  length as turfLength,
  lineSliceAlong,
  lineString,
  nearestPointOnLine,
  point as turfPoint,
  pointToLineDistance,
} from '@turf/turf';
import { FACILITY_CATEGORIES } from '../classify/categoryMeta';
import type {
  LngLatAlt,
  ParsedPoint,
  ParsedTrack,
  PointCategory,
  ProjectState,
  Stage,
  StageLeg,
} from '../types';

export function getStageLegTracks(
  state: ProjectState,
  stage: Stage,
): ParsedTrack[] {
  const out: ParsedTrack[] = [];
  for (const leg of stage.legs) {
    const t = state.tracks.find((tr) => tr.id === leg.trackId);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Concatenate every leg's coords (each leg reversed if its flag is set),
 * de-duplicating the seam point when two legs already meet.
 */
function joinLegCoords(state: ProjectState, legs: StageLeg[]): LngLatAlt[] {
  const out: LngLatAlt[] = [];
  for (const leg of legs) {
    const track = state.tracks.find((tr) => tr.id === leg.trackId);
    if (!track || track.coords.length < 2) continue;
    const segment = leg.reversed ? [...track.coords].reverse() : track.coords;
    if (out.length === 0) {
      out.push(...segment);
      continue;
    }
    const last = out[out.length - 1];
    const first = segment[0];
    if (last[0] === first[0] && last[1] === first[1]) {
      out.push(...segment.slice(1));
    } else {
      out.push(...segment);
    }
  }
  return out;
}

function cropCoords(
  coords: LngLatAlt[],
  cropStart: number,
  cropEnd: number,
): LngLatAlt[] {
  if (cropStart <= 0 && cropEnd >= 1) return coords;
  if (coords.length < 2) return coords;
  const flat = coords.map((c) => [c[0], c[1]] as [number, number]);
  const line = lineString(flat);
  const totalKm = turfLength(line, { units: 'kilometers' });
  if (totalKm === 0) return coords;
  const startKm = Math.max(0, Math.min(1, cropStart)) * totalKm;
  const endKm = Math.max(0, Math.min(1, cropEnd)) * totalKm;
  if (endKm <= startKm + 1e-9) {
    return [coords[Math.floor(cropStart * (coords.length - 1))] ?? coords[0]];
  }
  const sliced = lineSliceAlong(line, startKm, endKm, {
    units: 'kilometers',
  });
  return sliced.geometry.coordinates.map(
    (c) => [c[0], c[1]] as LngLatAlt,
  );
}

/**
 * Returns the LineString coords that downstream consumers (map, length,
 * buffer, export) should treat as the stage geometry. Concatenates the
 * stage's legs in order (each flipped if `leg.reversed`), then applies the
 * `cropStart`/`cropEnd` fractional cut via `turf.lineSliceAlong` for
 * metre-stable cropping.
 */
export function getStageDerivedGeometry(
  state: ProjectState,
  stageId: string,
): LngLatAlt[] | undefined {
  const stage = state.stages.find((s) => s.id === stageId);
  if (!stage) return undefined;
  const joined = joinLegCoords(state, stage.legs);
  if (joined.length < 2) return joined;
  return cropCoords(joined, stage.cropStart, stage.cropEnd);
}

export function getStageJoinedGeometry(
  state: ProjectState,
  stageId: string,
): LngLatAlt[] | undefined {
  const stage = state.stages.find((s) => s.id === stageId);
  if (!stage) return undefined;
  return joinLegCoords(state, stage.legs);
}

export function getStageLengthKm(
  state: ProjectState,
  stageId: string,
): number {
  const coords = getStageDerivedGeometry(state, stageId);
  if (!coords || coords.length < 2) return 0;
  return turfLength(
    lineString(coords.map((c) => [c[0], c[1]])),
    { units: 'kilometers' },
  );
}

export function getStageStartEnd(
  state: ProjectState,
  stageId: string,
): { start: LngLatAlt; end: LngLatAlt } | undefined {
  const coords = getStageDerivedGeometry(state, stageId);
  if (!coords || coords.length < 2) return undefined;
  return { start: coords[0], end: coords[coords.length - 1] };
}

export function getStageByTrackId(
  state: ProjectState,
  trackId: string,
): Stage | undefined {
  return state.stages.find((s) => s.legs.some((leg) => leg.trackId === trackId));
}

export function getStagedTrackIds(state: ProjectState): Set<string> {
  const ids = new Set<string>();
  for (const s of state.stages) {
    for (const leg of s.legs) ids.add(leg.trackId);
  }
  return ids;
}

/**
 * For appending `nextTrack` after the joined-coords-so-far that end at
 * `previousEnd`, returns true when `nextTrack` should be reversed so its
 * nearer endpoint joins onto `previousEnd`.
 */
export function autoOrientLeg(
  previousEnd: LngLatAlt,
  nextTrack: ParsedTrack,
): boolean {
  if (nextTrack.coords.length < 2) return false;
  const a = nextTrack.coords[0];
  const b = nextTrack.coords[nextTrack.coords.length - 1];
  const prev = turfPoint([previousEnd[0], previousEnd[1]]);
  const dStart = turfDistance(prev, turfPoint([a[0], a[1]]), {
    units: 'meters',
  });
  const dEnd = turfDistance(prev, turfPoint([b[0], b[1]]), {
    units: 'meters',
  });
  return dEnd < dStart;
}

/** Convert a clicked map position to a fractional position along the joined
 * stage line. Returns `null` if the line is too short. */
export function snapToStageFraction(
  joined: LngLatAlt[],
  clicked: LngLatAlt,
): number | null {
  if (joined.length < 2) return null;
  const flat = joined.map((c) => [c[0], c[1]] as [number, number]);
  const line = lineString(flat);
  const totalKm = turfLength(line, { units: 'kilometers' });
  if (totalKm <= 0) return null;
  const snapped = nearestPointOnLine(
    line,
    turfPoint([clicked[0], clicked[1]]),
    { units: 'kilometers' },
  );
  const km = snapped.properties.location ?? 0;
  return Math.max(0, Math.min(1, km / totalKm));
}

export function effectiveCategory(p: ParsedPoint): PointCategory {
  return p.categoryOverride ?? p.category;
}

interface StageCandidate {
  stageId: string;
  folderPath: string[];
  coords: LngLatAlt[];
}

function buildCandidates(state: ProjectState): StageCandidate[] {
  const out: StageCandidate[] = [];
  for (const s of state.stages) {
    const coords = getStageJoinedGeometry(state, s.id) ?? [];
    if (coords.length >= 2) {
      const firstTrack = state.tracks.find(
        (tr) => tr.id === s.legs[0]?.trackId,
      );
      out.push({
        stageId: s.id,
        folderPath: firstTrack?.folderPath ?? [],
        coords,
      });
    }
  }
  return out;
}

function distanceKm(p: ParsedPoint, c: StageCandidate): number {
  return pointToLineDistance(
    turfPoint([p.coord[0], p.coord[1]]),
    lineString(c.coords.map((co) => [co[0], co[1]])),
    { units: 'kilometers' },
  );
}

function sameFolderPath(a: string[], b: string[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Points further than this from every stage polyline are not auto-assigned. */
const MAX_AUTO_ASSIGN_KM = 1.0;

function autoStageId(
  p: ParsedPoint,
  candidates: StageCandidate[],
): string | null {
  if (candidates.length === 0) return null;
  const sameFolder = candidates.filter((c) =>
    sameFolderPath(c.folderPath, p.folderPath),
  );
  const pool = sameFolder.length > 0 ? sameFolder : candidates;
  let bestId = pool[0].stageId;
  let bestDist = distanceKm(p, pool[0]);
  for (let i = 1; i < pool.length; i++) {
    const d = distanceKm(p, pool[i]);
    if (d < bestDist) {
      bestDist = d;
      bestId = pool[i].stageId;
    }
  }
  // Don't assign to a stage that's too far away — standalone TCs, service-park
  // controls, etc. should stay unassigned rather than polluting a distant stage.
  return bestDist <= MAX_AUTO_ASSIGN_KM ? bestId : null;
}

/**
 * For every point, return its effective stage id (user override wins; falls
 * back to folder-path-preferred nearest-line auto-assignment for non-`other`
 * points). Returns `null` for explicitly unassigned or no-stages situations.
 */
export function getEffectivePointStages(
  state: ProjectState,
): Map<string, string | null> {
  const candidates = buildCandidates(state);
  const validStageIds = new Set(state.stages.map((s) => s.id));
  const result = new Map<string, string | null>();
  for (const p of state.points) {
    if (p.stageOverride !== undefined) {
      result.set(
        p.id,
        p.stageOverride && validStageIds.has(p.stageOverride)
          ? p.stageOverride
          : null,
      );
      continue;
    }
    if (FACILITY_CATEGORIES.has(effectiveCategory(p))) {
      result.set(p.id, null);
      continue;
    }
    result.set(p.id, autoStageId(p, candidates));
  }
  return result;
}

export function getStageAssignedPoints(
  state: ProjectState,
  stageId: string,
): ParsedPoint[] {
  const map = getEffectivePointStages(state);
  return state.points.filter((p) => map.get(p.id) === stageId);
}

/**
 * Among points assigned to a stage, returns the ATC/TC point that is closest
 * to the stage's start coordinate — this is the "arrival TC" competitors must
 * check into before the stage begins, and the most operationally important TC
 * for deployment planning.
 */
export function getPreStartTc(
  state: ProjectState,
  stageId: string,
): ParsedPoint | undefined {
  const stageStart = getStageStartEnd(state, stageId)?.start;
  if (!stageStart) return undefined;
  const assigned = getStageAssignedPoints(state, stageId);
  const tcs = assigned.filter((p) => effectiveCategory(p) === 'atc');
  if (tcs.length === 0) return undefined;
  const origin = turfPoint([stageStart[0], stageStart[1]]);
  let best = tcs[0];
  let bestDist = turfDistance(origin, turfPoint([best.coord[0], best.coord[1]]), { units: 'meters' });
  for (let i = 1; i < tcs.length; i++) {
    const d = turfDistance(origin, turfPoint([tcs[i].coord[0], tcs[i].coord[1]]), { units: 'meters' });
    if (d < bestDist) { bestDist = d; best = tcs[i]; }
  }
  return best;
}

/**
 * Build a Calirad-friendly default export name from a track's KML name.
 * Format: SSX-Y-Z (stage numbers only, no location name).
 * Examples:
 *   "SS1/5 - Sarnau (4.38 miles)"  -> "SS1-5"
 *   "SS1/SS5 - El Condado"         -> "SS1-5"
 *   "SS7"                          -> "SS7"
 *   "SS7" (second occurrence)      -> "SS7-2"
 */
export function defaultExportName(
  track: ParsedTrack,
  existing: Set<string>,
): string {
  const raw = (track.name || 'stage').toString();

  // Strip location name and parenthetical parts first, then extract SS identifier.
  // "SS1/SS5 - Sarnau (4.38 miles)" → identifier "SS1/SS5" → "SS1-5"
  const identifier = raw
    .replace(/\s*[-–]\s*.+$/, '')      // drop "- Location name"
    .replace(/\s*\([^)]*\)\s*/g, '')   // drop "(4.38 miles)"
    .trim();

  let base: string;
  if (/^ss/i.test(identifier)) {
    // Collect all digit groups in the identifier: SS1/5 → [1,5], SS1/SS5 → [1,5]
    const nums = identifier.match(/\d+/g) ?? [];
    base = nums.length > 0 ? `SS${nums.join('-')}` : 'SS';
  } else {
    // No SS prefix — normalise separators as fallback
    base =
      identifier
        .replace(/[/\\]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/[^A-Za-z0-9\-_.]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'stage';
  }

  if (!existing.has(base)) return base;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < letters.length; i++) {
    const candidate = `${base}-${letters[i]}`;
    if (!existing.has(candidate)) return candidate;
  }
  // Extremely unlikely fallback if all 26 letters are taken
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
