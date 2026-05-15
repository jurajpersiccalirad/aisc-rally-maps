import { describe, expect, it } from 'vitest';
import {
  forceMultiPolygonToWkt,
  lineStringToWkt,
  multiPolygonToWkt,
} from '../../src/export/wktWriter';

describe('wktWriter', () => {
  it('LINESTRING keeps shortest-unique representation', () => {
    expect(
      lineStringToWkt([
        [-3.4381498, 52.3507264],
        [-3.4378011, 52.3504839],
      ]),
    ).toBe('LINESTRING (-3.4381498 52.3507264, -3.4378011 52.3504839)');
  });

  it('POLYGON for MultiPolygon-of-length-1', () => {
    expect(
      multiPolygonToWkt([
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      ]),
    ).toBe('POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))');
  });

  it('POLYGON with a hole', () => {
    expect(
      multiPolygonToWkt([
        [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          [
            [2, 2],
            [4, 2],
            [4, 4],
            [2, 4],
            [2, 2],
          ],
        ],
      ]),
    ).toBe(
      'POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0), (2 2, 4 2, 4 4, 2 4, 2 2))',
    );
  });

  it('MULTIPOLYGON for >=2 polygons', () => {
    expect(
      multiPolygonToWkt([
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
            [2, 2],
          ],
        ],
      ]),
    ).toBe(
      'MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0)), ((2 2, 3 2, 3 3, 2 3, 2 2)))',
    );
  });

  it('forceMultiPolygonToWkt always wraps as MULTIPOLYGON', () => {
    expect(
      forceMultiPolygonToWkt([
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      ]),
    ).toBe('MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0)))');
  });
});
