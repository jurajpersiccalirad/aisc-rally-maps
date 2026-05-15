import { newId } from '../lib/id';
import type { ParseResult, SourceFile, SourceFileKind } from '../types';
import { gpxToFeatures } from './gpxToFeatures';
import { kmlToFeatures } from './kmlToFeatures';
import { kmzToKml } from './kmzToKml';

function detectKind(filename: string): SourceFileKind | undefined {
  const m = filename.toLowerCase().match(/\.(kmz|kml|gpx)$/);
  return m ? (m[1] as SourceFileKind) : undefined;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.(kmz|kml|gpx)$/i, '');
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    throw new Error(`XML parse error: ${err.textContent ?? 'unknown'}`);
  }
  return doc;
}

/**
 * Lower-level entry point: parse a raw byte payload. Used by `readUploadedFile`
 * in the browser and directly by tests where the File API has realm quirks.
 */
export async function readUploadedBytes(
  bytes: Uint8Array,
  filename: string,
  kind: SourceFileKind,
  sizeBytes: number = bytes.byteLength,
): Promise<ParseResult> {
  const fallbackName = stripExtension(filename);
  const sourceFile: SourceFile = {
    id: newId(),
    name: filename,
    kind,
    sizeBytes,
  };

  if (kind === 'kmz') {
    const { text } = await kmzToKml(bytes);
    const doc = parseXml(text);
    const { tracks, points, eventName } = kmlToFeatures(
      doc,
      sourceFile.id,
      fallbackName,
    );
    return { sourceFile, suggestedEventName: eventName, tracks, points };
  }

  const text = new TextDecoder().decode(bytes);
  const doc = parseXml(text);
  if (kind === 'kml') {
    const { tracks, points, eventName } = kmlToFeatures(
      doc,
      sourceFile.id,
      fallbackName,
    );
    return { sourceFile, suggestedEventName: eventName, tracks, points };
  }

  const { tracks, points, eventName } = gpxToFeatures(
    doc,
    sourceFile.id,
    fallbackName,
  );
  return { sourceFile, suggestedEventName: eventName, tracks, points };
}

/**
 * Parse one uploaded file into a `ParseResult`. Single-file by design so that
 * future multi-file ingest can loop over this in the reducer without touching
 * the parse layer.
 */
export async function readUploadedFile(file: File): Promise<ParseResult> {
  const kind = detectKind(file.name);
  if (!kind) {
    throw new Error(
      `Unsupported file type: ${file.name}. Use KMZ, KML, or GPX.`,
    );
  }
  // Copy into a fresh, local-realm Uint8Array so downstream type checks
  // (e.g. JSZip's instanceof) succeed regardless of which realm the File came
  // from.
  const arrayBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf.byteLength);
  bytes.set(new Uint8Array(arrayBuf));
  return readUploadedBytes(bytes, file.name, kind, file.size);
}
