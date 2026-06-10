export type LngLatAlt = [number, number] | [number, number, number];

export type PointCategory =
  | 'start'
  | 'finish'
  | 'stop'
  | 'atc'
  | 'pc'
  | 'intermediate'
  | 'chicane'
  | 'marshall'
  | 'radio'
  | 'ambulance'
  | 'refuel'
  | 'scrutineering'
  | 'service_park'
  | 'hq'
  | 'parc_ferme'
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

export type ZoneCategory = 'service_park' | 'parc_ferme' | 'hq' | 'other';

export interface ManualZone {
  id: string;
  name: string;
  category: ZoneCategory;
  coords: LngLatAlt[];
}

export interface DeploymentPlan {
  originId: string;
  stops: { id: string; pointId: string }[];
  waitTimes: Record<string, number>;
  stageSchedule: { stageId: string; stageName: string; startTime: string }[];
  eventDate: string;
  closure: { publicMinutes: number; orgMinutes: number; safetyMinutes: number; role: 'public' | 'org' | 'safety' };
  departureTime: string;
  selectedOptions: Record<string, number>;
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
  deploymentPlan?: DeploymentPlan;
  manualZones?: ManualZone[];
}

export interface ParseResult {
  sourceFile: SourceFile;
  suggestedEventName: string;
  tracks: ParsedTrack[];
  points: ParsedPoint[];
}
