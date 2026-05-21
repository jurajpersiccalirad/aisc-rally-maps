export type LngLatAlt = [number, number] | [number, number, number];

export type PointCategory =
  | 'start'
  | 'finish'
  | 'flying_finish'
  | 'stop'
  | 'atc'
  | 'pc'
  | 'sss'
  | 'intermediate'
  | 'radio'
  | 'ambulance'
  | 'refuel'
  | 'scrutineering'
  | 'other';

export interface ParsedPlacemark {
  id: string;
  sourceFileId: string;
  name: string;
  description?: string;
  folderPath: string[];
  styleUrl: string;
  styleColorHex?: string;
  iconHref?: string;
}

export interface ParsedTrack extends ParsedPlacemark {
  coords: LngLatAlt[];
  lengthKm: number;
}

export interface ParsedPoint extends ParsedPlacemark {
  coord: LngLatAlt;
  category: PointCategory;
  /** User override for category; `undefined` means use auto `category`. */
  categoryOverride?: PointCategory;
  /**
   * User override for assigned stage. `undefined` = use auto-assign; `null` =
   * explicitly unassigned; string = stage id.
   */
  stageOverride?: string | null;
}

export interface StageLeg {
  trackId: string;
  reversed: boolean;
}

export interface Stage {
  id: string;
  /** Ordered legs that compose this stage. At least one. */
  legs: StageLeg[];
  exportName: string;
  /** Crop fraction over the joined geometry, 0 ≤ start < end ≤ 1. */
  cropStart: number;
  cropEnd: number;
  bufferRadiusM: number;
}

export type SourceFileKind = 'kmz' | 'kml' | 'gpx';

export interface SourceFile {
  id: string;
  name: string;
  kind: SourceFileKind;
  sizeBytes: number;
}

export interface ProjectState {
  eventName: string;
  /** Human-readable version label for this event snapshot, e.g. "v1", "Final". */
  version: string;
  sourceFiles: SourceFile[];
  tracks: ParsedTrack[];
  points: ParsedPoint[];
  stages: Stage[];
  bufferRadiusDefault: number;
}

export interface ParseResult {
  sourceFile: SourceFile;
  suggestedEventName: string;
  tracks: ParsedTrack[];
  points: ParsedPoint[];
}
