import type {
  LngLatAlt,
  ParseResult,
  ParsedTrack,
  PointCategory,
  ProjectState,
  Stage,
  StageLeg,
} from '../types';
import { autoOrientLeg, defaultExportName } from './selectors';
import { newId } from '../lib/id';

export const initialProjectState: ProjectState = {
  eventName: '',
  sourceFiles: [],
  tracks: [],
  points: [],
  stages: [],
  bufferRadiusDefault: 30,
};

export type ProjectAction =
  | { type: 'LOAD_SOURCE_FILE'; result: ParseResult }
  | { type: 'LOAD_PROJECT_JSON'; state: ProjectState }
  | { type: 'RESET' }
  | { type: 'SET_EVENT_NAME'; name: string }
  | { type: 'ADD_STAGE'; trackId: string }
  | { type: 'ADD_ALL_TRACKS_AS_STAGES' }
  | { type: 'ADD_TRACK_TO_STAGE'; stageId: string; trackId: string }
  | { type: 'REMOVE_TRACK_FROM_STAGE'; stageId: string; legIndex: number }
  | { type: 'TOGGLE_LEG_REVERSED'; stageId: string; legIndex: number }
  | { type: 'REVERSE_STAGE'; stageId: string }
  | { type: 'REMOVE_STAGE'; stageId: string }
  | { type: 'RENAME_STAGE'; stageId: string; exportName: string }
  | { type: 'SET_STAGE_BUFFER'; stageId: string; bufferRadiusM: number }
  | { type: 'SET_DEFAULT_BUFFER'; bufferRadiusM: number }
  | {
      type: 'SET_CROP';
      stageId: string;
      cropStart?: number;
      cropEnd?: number;
    }
  | {
      type: 'OVERRIDE_POINT_CATEGORY';
      pointId: string;
      category: PointCategory | undefined;
    }
  | {
      type: 'OVERRIDE_POINT_STAGE';
      pointId: string;
      stageId: string | null | undefined;
    };

function makeStage(
  trackId: string,
  exportName: string,
  bufferRadiusM: number,
): Stage {
  return {
    id: newId(),
    legs: [{ trackId, reversed: false }],
    exportName,
    cropStart: 0,
    cropEnd: 1,
    bufferRadiusM,
  };
}

function existingNames(stages: Stage[]): Set<string> {
  return new Set(stages.map((s) => s.exportName));
}

function allStagedTrackIds(stages: Stage[]): Set<string> {
  const ids = new Set<string>();
  for (const s of stages) for (const leg of s.legs) ids.add(leg.trackId);
  return ids;
}

function lastEndpoint(
  legs: StageLeg[],
  tracks: ParsedTrack[],
): LngLatAlt | undefined {
  for (let i = legs.length - 1; i >= 0; i--) {
    const leg = legs[i];
    const t = tracks.find((tr) => tr.id === leg.trackId);
    if (t && t.coords.length >= 2) {
      return leg.reversed ? t.coords[0] : t.coords[t.coords.length - 1];
    }
  }
  return undefined;
}

function clampFraction(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function projectReducer(
  state: ProjectState,
  action: ProjectAction,
): ProjectState {
  switch (action.type) {
    case 'LOAD_SOURCE_FILE': {
      const { sourceFile, suggestedEventName, tracks, points } = action.result;
      return {
        ...initialProjectState,
        eventName: suggestedEventName,
        sourceFiles: [sourceFile],
        tracks,
        points,
      };
    }
    case 'LOAD_PROJECT_JSON':
      return action.state;
    case 'RESET':
      return initialProjectState;
    case 'SET_EVENT_NAME':
      return { ...state, eventName: action.name };
    case 'ADD_STAGE': {
      if (allStagedTrackIds(state.stages).has(action.trackId)) return state;
      const track = state.tracks.find((t) => t.id === action.trackId);
      if (!track) return state;
      const name = defaultExportName(track, existingNames(state.stages));
      return {
        ...state,
        stages: [
          ...state.stages,
          makeStage(track.id, name, state.bufferRadiusDefault),
        ],
      };
    }
    case 'ADD_ALL_TRACKS_AS_STAGES': {
      const existing = existingNames(state.stages);
      const stagedIds = allStagedTrackIds(state.stages);
      const newStages: Stage[] = [];
      for (const t of state.tracks) {
        if (stagedIds.has(t.id)) continue;
        const name = defaultExportName(t, existing);
        existing.add(name);
        newStages.push(makeStage(t.id, name, state.bufferRadiusDefault));
      }
      if (newStages.length === 0) return state;
      return { ...state, stages: [...state.stages, ...newStages] };
    }
    case 'ADD_TRACK_TO_STAGE': {
      if (allStagedTrackIds(state.stages).has(action.trackId)) return state;
      const newTrack = state.tracks.find((t) => t.id === action.trackId);
      if (!newTrack || newTrack.coords.length < 2) return state;
      const stage = state.stages.find((s) => s.id === action.stageId);
      if (!stage) return state;
      const prevEnd = lastEndpoint(stage.legs, state.tracks);
      const reversed = prevEnd ? autoOrientLeg(prevEnd, newTrack) : false;
      return {
        ...state,
        stages: state.stages.map((s) =>
          s.id === action.stageId
            ? {
                ...s,
                legs: [...s.legs, { trackId: newTrack.id, reversed }],
                cropStart: 0,
                cropEnd: 1,
              }
            : s,
        ),
      };
    }
    case 'REMOVE_TRACK_FROM_STAGE': {
      return {
        ...state,
        stages: state.stages.map((s) => {
          if (s.id !== action.stageId) return s;
          if (s.legs.length <= 1) return s;
          if (action.legIndex < 0 || action.legIndex >= s.legs.length) return s;
          const legs = s.legs.filter((_, i) => i !== action.legIndex);
          return { ...s, legs, cropStart: 0, cropEnd: 1 };
        }),
      };
    }
    case 'TOGGLE_LEG_REVERSED': {
      return {
        ...state,
        stages: state.stages.map((s) => {
          if (s.id !== action.stageId) return s;
          return {
            ...s,
            legs: s.legs.map((leg, i) =>
              i === action.legIndex ? { ...leg, reversed: !leg.reversed } : leg,
            ),
          };
        }),
      };
    }
    case 'REVERSE_STAGE': {
      return {
        ...state,
        stages: state.stages.map((s) => {
          if (s.id !== action.stageId) return s;
          return {
            ...s,
            legs: [...s.legs]
              .reverse()
              .map((leg) => ({ ...leg, reversed: !leg.reversed })),
            cropStart: clampFraction(1 - s.cropEnd),
            cropEnd: clampFraction(1 - s.cropStart),
          };
        }),
      };
    }
    case 'REMOVE_STAGE':
      return {
        ...state,
        stages: state.stages.filter((s) => s.id !== action.stageId),
      };
    case 'RENAME_STAGE':
      return {
        ...state,
        stages: state.stages.map((s) =>
          s.id === action.stageId
            ? { ...s, exportName: action.exportName }
            : s,
        ),
      };
    case 'SET_STAGE_BUFFER':
      return {
        ...state,
        stages: state.stages.map((s) =>
          s.id === action.stageId
            ? { ...s, bufferRadiusM: action.bufferRadiusM }
            : s,
        ),
      };
    case 'SET_DEFAULT_BUFFER':
      return { ...state, bufferRadiusDefault: action.bufferRadiusM };
    case 'SET_CROP':
      return {
        ...state,
        stages: state.stages.map((s) => {
          if (s.id !== action.stageId) return s;
          let cs =
            action.cropStart === undefined
              ? s.cropStart
              : clampFraction(action.cropStart);
          let ce =
            action.cropEnd === undefined
              ? s.cropEnd
              : clampFraction(action.cropEnd);
          if (action.cropStart !== undefined && cs > ce) ce = cs;
          if (action.cropEnd !== undefined && ce < cs) cs = ce;
          return { ...s, cropStart: cs, cropEnd: ce };
        }),
      };
    case 'OVERRIDE_POINT_CATEGORY':
      return {
        ...state,
        points: state.points.map((p) =>
          p.id === action.pointId
            ? { ...p, categoryOverride: action.category }
            : p,
        ),
      };
    case 'OVERRIDE_POINT_STAGE':
      return {
        ...state,
        points: state.points.map((p) =>
          p.id === action.pointId
            ? { ...p, stageOverride: action.stageId }
            : p,
        ),
      };
    default:
      return state;
  }
}
