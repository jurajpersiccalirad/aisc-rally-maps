import { length as turfLength, lineString } from '@turf/turf';
import { classifyPoint } from '../classify/pointCategory';
import { newId } from '../lib/id';
import type { LngLatAlt, ParsedPoint, ParsedTrack } from '../types';
import { extractStyles, lookupStyle, type StyleEntry } from './extractStyles';

export interface KmlParseResult {
  tracks: ParsedTrack[];
  points: ParsedPoint[];
  eventName: string;
}

function parseCoordsString(text: string | null | undefined): LngLatAlt[] {
  if (!text) return [];
  const out: LngLatAlt[] = [];
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    const parts = token.split(',');
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const altRaw = parts[2];
    if (altRaw !== undefined && altRaw !== '') {
      const alt = Number(altRaw);
      out.push(Number.isFinite(alt) ? [lon, lat, alt] : [lon, lat]);
    } else {
      out.push([lon, lat]);
    }
  }
  return out;
}

function directChild(parent: Element, tag: string): Element | undefined {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tag) return child;
  }
  return undefined;
}

function folderPathFor(placemark: Element): string[] {
  const path: string[] = [];
  let cur: Element | null = placemark.parentElement;
  while (cur) {
    if (cur.tagName === 'Folder') {
      const nameEl = directChild(cur, 'name');
      const name = nameEl?.textContent?.trim();
      if (name) path.unshift(name);
    }
    if (cur.tagName === 'Document') break;
    cur = cur.parentElement;
  }
  return path;
}

function resolveColors(
  styleUrl: string,
  styles: Map<string, StyleEntry>,
): { styleColorHex?: string; iconHref?: string; lineColorHex?: string } {
  const entry = styleUrl ? lookupStyle(styles, styleUrl) : undefined;
  if (!entry) return {};
  return {
    styleColorHex: entry.iconColorHex ?? entry.lineColorHex,
    iconHref: entry.iconHref,
    lineColorHex: entry.lineColorHex,
  };
}

export function kmlToFeatures(
  doc: Document,
  sourceFileId: string,
  fallbackName: string,
): KmlParseResult {
  const styles = extractStyles(doc);
  const tracks: ParsedTrack[] = [];
  const points: ParsedPoint[] = [];

  for (const placemark of Array.from(doc.getElementsByTagName('Placemark'))) {
    const name = directChild(placemark, 'name')?.textContent?.trim() ?? '';
    const description =
      directChild(placemark, 'description')?.textContent?.trim() ?? undefined;
    const styleUrlRaw =
      directChild(placemark, 'styleUrl')?.textContent?.trim() ?? '';
    const folderPath = folderPathFor(placemark);
    const colors = resolveColors(styleUrlRaw, styles);

    const lineEl =
      placemark.getElementsByTagName('LineString')[0] ??
      placemark.getElementsByTagName('MultiLineString')[0]?.getElementsByTagName(
        'LineString',
      )[0];
    if (lineEl) {
      const coordsEl = directChild(lineEl, 'coordinates');
      const coords = parseCoordsString(coordsEl?.textContent);
      if (coords.length >= 2) {
        const lengthKm = turfLength(
          lineString(coords.map((c) => [c[0], c[1]])),
          { units: 'kilometers' },
        );
        const track: ParsedTrack = {
          id: newId(),
          sourceFileId,
          name,
          description,
          folderPath,
          styleUrl: styleUrlRaw,
          styleColorHex: colors.lineColorHex ?? colors.styleColorHex,
          iconHref: colors.iconHref,
          coords,
          lengthKm,
        };
        tracks.push(track);
      }
      continue;
    }

    const pointEl = placemark.getElementsByTagName('Point')[0];
    if (pointEl) {
      const coordsEl = directChild(pointEl, 'coordinates');
      const coords = parseCoordsString(coordsEl?.textContent);
      if (coords.length >= 1) {
        const point: ParsedPoint = {
          id: newId(),
          sourceFileId,
          name,
          description,
          folderPath,
          styleUrl: styleUrlRaw,
          styleColorHex: colors.styleColorHex,
          iconHref: colors.iconHref,
          coord: coords[0],
          category: classifyPoint({ name, description, styleUrl: styleUrlRaw }),
        };
        points.push(point);
      }
    }
  }

  const eventName =
    doc.getElementsByTagName('Document')[0]
      ?.getElementsByTagName('name')[0]
      ?.textContent?.trim() ??
    fallbackName;

  return { tracks, points, eventName };
}
