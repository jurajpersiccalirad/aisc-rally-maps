import { describe, expect, it } from 'vitest';
import { csvSummary } from '../../src/export/csvSummary';
import type { PointCategory } from '../../src/types';

describe('csvSummary', () => {
  it('emits a header row and one stage row', () => {
    const counts = new Map<PointCategory, number>([
      ['start', 1],
      ['stop', 1],
      ['atc', 1],
      ['pc', 4],
    ]);
    const text = csvSummary([
      {
        exportName: 'SS1-5',
        lengthKm: 7.05,
        start: [-3.4055093, 52.3358666],
        end: [-3.4381498, 52.3507264],
        bufferM: 30,
        pointCounts: counts,
        overlapsWith: ['SS7'],
      },
    ]);
    const lines = text.trimEnd().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0].startsWith('stage,length_km,start_lng,start_lat')).toBe(
      true,
    );
    expect(lines[1].startsWith('SS1-5,7.050000,-3.4055093,52.3358666')).toBe(
      true,
    );
    expect(lines[1].endsWith(',SS7')).toBe(true);
  });

  it('escapes commas/quotes in stage names', () => {
    const counts = new Map<PointCategory, number>();
    const text = csvSummary([
      {
        exportName: 'Stage, "Special"',
        lengthKm: 1,
        start: [0, 0],
        end: [1, 1],
        bufferM: 30,
        pointCounts: counts,
        overlapsWith: [],
      },
    ]);
    expect(text).toContain('"Stage, ""Special"""');
  });
});
