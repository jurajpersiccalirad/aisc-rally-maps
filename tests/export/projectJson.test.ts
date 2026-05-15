import { describe, expect, it } from 'vitest';
import {
  deserializeProject,
  projectJsonFilename,
  serializeProject,
} from '../../src/export/projectJson';
import { initialProjectState, projectReducer } from '../../src/state/projectReducer';
import type { ParseResult } from '../../src/types';

function loadedState() {
  const parse: ParseResult = {
    sourceFile: { id: 'src1', name: 'demo.kml', kind: 'kml', sizeBytes: 100 },
    suggestedEventName: 'Demo Rally',
    tracks: [
      {
        id: 't1',
        sourceFileId: 'src1',
        name: 'SS1',
        folderPath: ['Day 1', 'SS1'],
        styleUrl: '#x',
        coords: [
          [0, 0],
          [0.001, 0],
          [0.002, 0],
        ],
        lengthKm: 0.222,
      },
    ],
    points: [
      {
        id: 'p1',
        sourceFileId: 'src1',
        name: 'Start SS1',
        folderPath: ['Day 1', 'SS1'],
        styleUrl: '#s',
        coord: [0, 0],
        category: 'start',
      },
    ],
  };
  let s = projectReducer(initialProjectState, {
    type: 'LOAD_SOURCE_FILE',
    result: parse,
  });
  s = projectReducer(s, { type: 'ADD_STAGE', trackId: 't1' });
  s = projectReducer(s, {
    type: 'SET_CROP',
    stageId: s.stages[0].id,
    cropStart: 0.1,
    cropEnd: 0.9,
  });
  s = projectReducer(s, {
    type: 'OVERRIDE_POINT_CATEGORY',
    pointId: 'p1',
    category: 'sss',
  });
  return s;
}

describe('projectJson', () => {
  it('round-trips state preserving stages, crops, and overrides', () => {
    const state = loadedState();
    const text = serializeProject(state);
    const loaded = deserializeProject(text);
    expect(loaded.eventName).toBe('Demo Rally');
    expect(loaded.stages.length).toBe(1);
    expect(loaded.stages[0].cropStart).toBe(0.1);
    expect(loaded.stages[0].cropEnd).toBe(0.9);
    expect(loaded.stages[0].legs[0].trackId).toBe('t1');
    expect(loaded.points[0].categoryOverride).toBe('sss');
  });

  it('rejects unsupported versions', () => {
    expect(() => deserializeProject('{"version":99,"state":{}}')).toThrow(
      /version/,
    );
  });

  it('rejects missing state field', () => {
    expect(() => deserializeProject('{"version":1}')).toThrow(/state/);
  });

  it('projectJsonFilename slugifies the event name', () => {
    expect(projectJsonFilename('Severn Valley Stages 2026')).toBe(
      'Severn-Valley-Stages-2026.aiscproj.json',
    );
    expect(projectJsonFilename('')).toBe('project.aiscproj.json');
  });
});
