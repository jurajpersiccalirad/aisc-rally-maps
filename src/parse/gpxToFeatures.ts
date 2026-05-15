import { length as turfLength, lineString } from '@turf/turf';
import { classifyPoint } from '../classify/pointCategory';
import { newId } from '../lib/id';
import type { LngLatAlt, ParsedPoint, ParsedTrack } from '../types';

export interface GpxParseResult {
  tracks: ParsedTrack[];
  points: ParsedPoint[];
  eventName: string;
}

function directChild(parent: Element, tag: string): Element | undefined {
  for (const child of Array.from(parent.children)) {
    if (child.localName === tag) return child;
  }
  return undefined;
}

function ptCoord(el: Element): LngLatAlt | undefined {
  const lat = Number(el.getAttribute('lat'));
  const lon = Number(el.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  const eleText = directChild(el, 'ele')?.textContent;
  if (eleText) {
    const ele = Number(eleText);
    if (Number.isFinite(ele)) return [lon, lat, ele];
  }
  return [lon, lat];
}

export function gpxToFeatures(
  doc: Document,
  sourceFileId: string,
  fallbackName: string,
): GpxParseResult {
  const tracks: ParsedTrack[] = [];
  const points: ParsedPoint[] = [];

  for (const trk of Array.from(doc.getElementsByTagName('trk'))) {
    const name = directChild(trk, 'name')?.textContent?.trim() ?? '';
    const coords: LngLatAlt[] = [];
    for (const seg of Array.from(trk.getElementsByTagName('trkseg'))) {
      for (const pt of Array.from(seg.getElementsByTagName('trkpt'))) {
        const c = ptCoord(pt);
        if (c) coords.push(c);
      }
    }
    if (coords.length >= 2) {
      const lengthKm = turfLength(
        lineString(coords.map((c) => [c[0], c[1]])),
        { units: 'kilometers' },
      );
      tracks.push({
        id: newId(),
        sourceFileId,
        name,
        folderPath: [],
        styleUrl: '',
        coords,
        lengthKm,
      });
    }
  }

  for (const wpt of Array.from(doc.getElementsByTagName('wpt'))) {
    const name = directChild(wpt, 'name')?.textContent?.trim() ?? '';
    const description =
      directChild(wpt, 'desc')?.textContent?.trim() ?? undefined;
    const coord = ptCoord(wpt);
    if (!coord) continue;
    const styleUrl = directChild(wpt, 'sym')?.textContent?.trim() ?? '';
    points.push({
      id: newId(),
      sourceFileId,
      name,
      description,
      folderPath: [],
      styleUrl,
      coord,
      category: classifyPoint({ name, description, styleUrl }),
    });
  }

  const metaName =
    doc.getElementsByTagName('metadata')[0]
      ?.getElementsByTagName('name')[0]
      ?.textContent?.trim();
  const eventName = metaName && metaName.length > 0 ? metaName : fallbackName;

  return { tracks, points, eventName };
}
