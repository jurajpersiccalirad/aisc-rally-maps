import { CATEGORY_META } from '../classify/categoryMeta';
import type { LngLatAlt, ParsedPoint, PointCategory } from '../types';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(n: number): string {
  return n.toString();
}

function elevation(c: LngLatAlt): string {
  return c.length >= 3 && c[2] !== undefined
    ? `\n      <ele>${attr(c[2])}</ele>`
    : '';
}

export interface GpxWaypoint {
  coord: LngLatAlt;
  name: string;
  category: PointCategory;
}

export function gpxForStage(
  stageName: string,
  coords: LngLatAlt[],
  waypoints: ParsedPoint[],
  effectiveCategoryOf: (p: ParsedPoint) => PointCategory,
): string {
  const wpts = waypoints
    .map((p) => {
      const cat = effectiveCategoryOf(p);
      const label = CATEGORY_META[cat].label;
      return `  <wpt lat="${attr(p.coord[1])}" lon="${attr(p.coord[0])}">
    <name>${escapeXml(p.name || p.description || '(unnamed)')}</name>
    <sym>${escapeXml(label)}</sym>
    <type>${escapeXml(cat)}</type>
  </wpt>`;
    })
    .join('\n');

  const trkpts = coords
    .map(
      (c) => `      <trkpt lat="${attr(c[1])}" lon="${attr(c[0])}">${elevation(c)}
      </trkpt>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="aisc-rally-maps" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}${wpts.length > 0 ? '\n' : ''}  <trk>
    <name>${escapeXml(stageName)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}
