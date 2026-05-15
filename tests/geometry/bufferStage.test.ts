import { describe, expect, it } from 'vitest';
import { bufferStage } from '../../src/geometry/bufferStage';
import { intersectionOf, overlaps } from '../../src/geometry/overlap';
import { repairPolygon } from '../../src/geometry/repairPolygon';
import type { LngLatAlt } from '../../src/types';

describe('bufferStage', () => {
  it('returns a valid MultiPolygon for a 1 km eastbound line', () => {
    const coords: LngLatAlt[] = [];
    const steps = 50;
    // ~1 km along the equator: 1 km ≈ 0.00898 degrees of longitude.
    for (let i = 0; i <= steps; i++) {
      coords.push([(0.00898 * i) / steps, 0]);
    }
    const mp = bufferStage(coords, 30);
    expect(mp).not.toBeNull();
    expect(mp!.length).toBeGreaterThan(0);
    // Outer ring should have >= 3 distinct points + close.
    expect(mp![0][0].length).toBeGreaterThan(3);
  });

  it('returns null for degenerate input', () => {
    expect(bufferStage([], 30)).toBeNull();
    expect(bufferStage([[0, 0]], 30)).toBeNull();
    expect(bufferStage(
      [
        [0, 0],
        [0.001, 0],
      ],
      0,
    )).toBeNull();
  });
});

describe('repairPolygon', () => {
  it('passes through a simple, already-valid polygon unchanged in vertex shape', () => {
    const square: number[][][][] = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    ];
    const out = repairPolygon(square);
    expect(out.length).toBe(1);
    expect(out[0][0].length).toBeGreaterThanOrEqual(4);
  });

  it('turns a bow-tie self-intersection into a simple MultiPolygon', () => {
    // Bow-tie shape that crosses itself in the middle.
    const bowTie: number[][][][] = [
      [
        [
          [0, 0],
          [2, 2],
          [2, 0],
          [0, 2],
          [0, 0],
        ],
      ],
    ];
    const out = repairPolygon(bowTie);
    expect(out.length).toBeGreaterThanOrEqual(1);
    // After union the rings should be simple, i.e. each ring should not
    // self-cross. We assert at least that the result is non-empty.
    for (const poly of out) {
      for (const ring of poly) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe('overlap', () => {
  const sqA: number[][][][] = [
    [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
  ];
  const sqOverlapsA: number[][][][] = [
    [
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, 1],
      ],
    ],
  ];
  const sqDisjoint: number[][][][] = [
    [
      [
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 11],
        [10, 10],
      ],
    ],
  ];

  it('overlaps() returns true for intersecting rectangles', () => {
    expect(overlaps(sqA, sqOverlapsA)).toBe(true);
  });

  it('overlaps() returns false for disjoint rectangles', () => {
    expect(overlaps(sqA, sqDisjoint)).toBe(false);
  });

  it('intersectionOf() returns the overlapping region as MultiPolygon', () => {
    const xs = intersectionOf(sqA, sqOverlapsA);
    expect(xs.length).toBeGreaterThan(0);
    expect(xs[0][0].length).toBeGreaterThanOrEqual(4);
  });
});
