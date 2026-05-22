import { describe, expect, it } from 'vitest';
import {
  autoOrientLeg,
  defaultExportName,
  getStageDerivedGeometry,
  getStageJoinedGeometry,
  getStageLengthKm,
  snapToStageFraction,
} from '../../src/state/selectors';
import {
  initialProjectState,
  projectReducer,
} from '../../src/state/projectReducer';
import type { LngLatAlt, ParsedTrack, ProjectState } from '../../src/types';

function track(
  partial: Partial<ParsedTrack> & { id: string; name: string },
): ParsedTrack {
  return {
    sourceFileId: 'src1',
    folderPath: [],
    styleUrl: '',
    coords: [
      [0, 0],
      [0.001, 0],
      [0.002, 0],
    ],
    lengthKm: 0.222,
    ...partial,
  };
}

/**
 * A track running west→east at constant latitude. Useful for tests where
 * crop fractions translate to predictable longitudes.
 */
function eastwardTrack(id: string, name: string, startLng: number, endLng: number): ParsedTrack {
  const steps = 100;
  const coords: LngLatAlt[] = [];
  for (let i = 0; i <= steps; i++) {
    const lng = startLng + ((endLng - startLng) * i) / steps;
    coords.push([lng, 0]);
  }
  return {
    id,
    name,
    sourceFileId: 'src1',
    folderPath: [],
    styleUrl: '',
    coords,
    lengthKm: 0,
  };
}

describe('defaultExportName', () => {
  it('replaces slashes with dashes', () => {
    expect(defaultExportName(track({ id: '1', name: 'SS1/5' }), new Set())).toBe(
      'SS1-5',
    );
  });

  it('strips location name and parenthesised suffix — numbers only', () => {
    expect(
      defaultExportName(
        track({ id: '2', name: 'SS1/SS5 - Sarnau (4.38 miles)' }),
        new Set(),
      ),
    ).toBe('SS1-5');
  });

  it('dedupes by suffixing -2, -3, ...', () => {
    const existing = new Set(['SS7']);
    expect(defaultExportName(track({ id: '3', name: 'SS7' }), existing)).toBe(
      'SS7-2',
    );
    existing.add('SS7-2');
    expect(defaultExportName(track({ id: '4', name: 'SS7' }), existing)).toBe(
      'SS7-3',
    );
  });

  it('falls back to "stage" when name is unusable', () => {
    expect(defaultExportName(track({ id: '5', name: '   ' }), new Set())).toBe(
      'stage',
    );
  });
});

describe('reducer + getStageDerivedGeometry', () => {
  function loadedState(): ProjectState {
    let state = initialProjectState;
    state = projectReducer(state, {
      type: 'LOAD_SOURCE_FILE',
      result: {
        sourceFile: {
          id: 'src1',
          name: 'demo.kml',
          kind: 'kml',
          sizeBytes: 100,
        },
        suggestedEventName: 'demo',
        tracks: [track({ id: 't1', name: 'SS1' })],
        points: [],
      },
    });
    return state;
  }

  it('ADD_STAGE creates a stage with deduped default name', () => {
    let state = loadedState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    expect(state.stages.length).toBe(1);
    expect(state.stages[0].exportName).toBe('SS1');
    expect(state.stages[0].bufferRadiusM).toBe(30);
  });

  it('ADD_STAGE is idempotent for the same track', () => {
    let state = loadedState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    const after = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    expect(after.stages.length).toBe(1);
  });

  it('getStageDerivedGeometry returns identity when no reverse/crop', () => {
    let state = loadedState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    const coords = getStageDerivedGeometry(state, state.stages[0].id);
    expect(coords).toEqual(state.tracks[0].coords);
  });

  it('REVERSE_STAGE flips coord order', () => {
    let state = loadedState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    state = projectReducer(state, {
      type: 'REVERSE_STAGE',
      stageId: state.stages[0].id,
    });
    const coords = getStageDerivedGeometry(state, state.stages[0].id);
    expect(coords?.[0]).toEqual(state.tracks[0].coords.at(-1));
    expect(coords?.at(-1)).toEqual(state.tracks[0].coords[0]);
  });

  it('TOGGLE_LEG_REVERSED flips the leg without touching crop', () => {
    let state = loadedState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    state = projectReducer(state, {
      type: 'TOGGLE_LEG_REVERSED',
      stageId: state.stages[0].id,
      legIndex: 0,
    });
    expect(state.stages[0].legs[0].reversed).toBe(true);
    const coords = getStageDerivedGeometry(state, state.stages[0].id);
    expect(coords?.[0]).toEqual(state.tracks[0].coords.at(-1));
  });

  it('getStageLengthKm equals turf length of identity geometry', () => {
    let state = loadedState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    const len = getStageLengthKm(state, state.stages[0].id);
    expect(len).toBeGreaterThan(0);
  });

  it('RENAME_STAGE updates exportName', () => {
    let state = loadedState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    state = projectReducer(state, {
      type: 'RENAME_STAGE',
      stageId: state.stages[0].id,
      exportName: 'Custom',
    });
    expect(state.stages[0].exportName).toBe('Custom');
  });

  it('REMOVE_STAGE drops the stage', () => {
    let state = loadedState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    state = projectReducer(state, {
      type: 'REMOVE_STAGE',
      stageId: state.stages[0].id,
    });
    expect(state.stages.length).toBe(0);
  });
});

describe('multi-track stages (legs)', () => {
  function twoTrackState(): ProjectState {
    let state = initialProjectState;
    state = projectReducer(state, {
      type: 'LOAD_SOURCE_FILE',
      result: {
        sourceFile: {
          id: 'src1',
          name: 'demo.kml',
          kind: 'kml',
          sizeBytes: 100,
        },
        suggestedEventName: 'demo',
        tracks: [
          eastwardTrack('tA', 'A', 0, 1),
          eastwardTrack('tB', 'B', 1, 2),
          // Track C is reversed in coords: starts at 3, runs back to 2.
          // So its `coords[0]=3` and `coords[end]=2`. When appended after
          // a track that ends at 2, auto-orient should reverse C so the
          // first coord becomes 2.
          eastwardTrack('tC', 'C', 3, 2),
        ],
        points: [],
      },
    });
    return state;
  }

  it('ADD_TRACK_TO_STAGE appends a leg, joined geometry concatenates', () => {
    let state = twoTrackState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 'tA' });
    state = projectReducer(state, {
      type: 'ADD_TRACK_TO_STAGE',
      stageId: state.stages[0].id,
      trackId: 'tB',
    });
    expect(state.stages[0].legs).toHaveLength(2);
    const joined = getStageJoinedGeometry(state, state.stages[0].id)!;
    expect(joined[0]).toEqual([0, 0]);
    expect(joined.at(-1)).toEqual([2, 0]);
  });

  it('auto-orients an appended leg whose nearer endpoint is its end', () => {
    let state = twoTrackState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 'tA' });
    // tA ends at lng=1. tB ends at lng=2 (closer). tC has coords going
    // from 3 → 2, so coords[0]=3, coords[end]=2; nearer endpoint to 1 is
    // coords[end] → auto-orient should reverse tC.
    state = projectReducer(state, {
      type: 'ADD_TRACK_TO_STAGE',
      stageId: state.stages[0].id,
      trackId: 'tC',
    });
    const legC = state.stages[0].legs[1];
    expect(legC.trackId).toBe('tC');
    expect(legC.reversed).toBe(true);
    const joined = getStageJoinedGeometry(state, state.stages[0].id)!;
    expect(joined.at(-1)).toEqual([3, 0]);
  });

  it('rejects appending a track already used in any stage', () => {
    let state = twoTrackState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 'tA' });
    const before = state.stages[0].legs.length;
    state = projectReducer(state, {
      type: 'ADD_TRACK_TO_STAGE',
      stageId: state.stages[0].id,
      trackId: 'tA',
    });
    expect(state.stages[0].legs.length).toBe(before);
  });

  it('REMOVE_TRACK_FROM_STAGE leaves at least one leg', () => {
    let state = twoTrackState();
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 'tA' });
    state = projectReducer(state, {
      type: 'REMOVE_TRACK_FROM_STAGE',
      stageId: state.stages[0].id,
      legIndex: 0,
    });
    expect(state.stages[0].legs.length).toBe(1);
  });
});

describe('crop via turf.lineSliceAlong', () => {
  function syntheticStage(start: number, end: number): ProjectState {
    let state = initialProjectState;
    state = projectReducer(state, {
      type: 'LOAD_SOURCE_FILE',
      result: {
        sourceFile: {
          id: 'src1',
          name: 'demo.kml',
          kind: 'kml',
          sizeBytes: 100,
        },
        suggestedEventName: 'demo',
        tracks: [eastwardTrack('t1', 'T', 0, 1)],
        points: [],
      },
    });
    state = projectReducer(state, { type: 'ADD_STAGE', trackId: 't1' });
    state = projectReducer(state, {
      type: 'SET_CROP',
      stageId: state.stages[0].id,
      cropStart: start,
      cropEnd: end,
    });
    return state;
  }

  it('crop (0.1, 0.9) gives ~80% of full length', () => {
    const state = syntheticStage(0, 1);
    const fullLen = getStageLengthKm(state, state.stages[0].id);
    const cropped = syntheticStage(0.1, 0.9);
    const len = getStageLengthKm(cropped, cropped.stages[0].id);
    expect(len).toBeCloseTo(fullLen * 0.8, 1);
  });

  it('SET_CROP clamps cropStart > cropEnd by pushing the other', () => {
    let state = syntheticStage(0, 1);
    state = projectReducer(state, {
      type: 'SET_CROP',
      stageId: state.stages[0].id,
      cropStart: 0.8,
    });
    expect(state.stages[0].cropStart).toBe(0.8);
    // cropEnd was 1 before; should still be >= cropStart
    expect(state.stages[0].cropEnd).toBeGreaterThanOrEqual(0.8);
  });
});

describe('autoOrientLeg + snapToStageFraction', () => {
  it('autoOrientLeg picks reversed when end is closer', () => {
    const t = eastwardTrack('x', 'X', 3, 2); // coords[0]=3, coords[end]=2
    expect(autoOrientLeg([1, 0], t)).toBe(true);
  });

  it('autoOrientLeg picks forward when start is closer', () => {
    const t = eastwardTrack('y', 'Y', 0.5, 2); // coords[0]=0.5, coords[end]=2
    expect(autoOrientLeg([0, 0], t)).toBe(false);
  });

  it('snapToStageFraction returns approximately midpoint for click at midpoint', () => {
    const coords: LngLatAlt[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    const f = snapToStageFraction(coords, [1, 0])!;
    expect(f).toBeCloseTo(0.5, 2);
  });
});
