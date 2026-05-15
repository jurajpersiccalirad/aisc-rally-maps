import type { LngLatAlt } from '../types';

export interface StageStartEnd {
  exportName: string;
  start: LngLatAlt;
  end: LngLatAlt;
}

/**
 * Reference format (from gpx_to_aisc/main.py:15-80):
 *   File: <stage>.gpx
 *     Start: <lng>, <lat>
 *     End: <lng>, <lat>
 *
 *   (blank line between entries)
 *
 * Coordinates emit with `Number.toString` (shortest unique IEEE
 * representation), so KML 7-decimal sources stay 7 decimals and full-
 * precision derived coords stay full precision — both match shapely's repr.
 */
export function startEndPointsTxt(stages: StageStartEnd[]): string {
  return (
    stages
      .map(
        (s) =>
          `File: ${s.exportName}.gpx\n  Start: ${s.start[0]}, ${s.start[1]}\n  End: ${s.end[0]}, ${s.end[1]}\n`,
      )
      .join('\n') + (stages.length > 0 ? '\n' : '')
  );
}
