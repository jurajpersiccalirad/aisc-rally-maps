import type { CoordFormat } from '../lib/formatCoord';
import type { LngLatAlt, PointCategory, ZoneCategory } from '../types';

export type { CoordFormat };

export type HoverState =
  | { kind: 'track'; trackId: string }
  | { kind: 'stage'; stageId: string };

export type CropMode = { stageId: string; edge: 'start' | 'end' } | null;

export interface Visibility {
  hiddenStageIds: ReadonlySet<string>;
  hiddenTrackIds: ReadonlySet<string>;
  hiddenCategories: ReadonlySet<PointCategory>;
  hiddenPointIds: ReadonlySet<string>;
  showBuffers: boolean;
  coordFormat: CoordFormat;
}

export interface VisibilityActions {
  toggleStage(id: string): void;
  toggleTrack(id: string): void;
  toggleCategory(c: PointCategory): void;
  togglePoint(id: string): void;
  toggleBuffers(): void;
  setCoordFormat(f: CoordFormat): void;
  showAll(): void;
}

export type FocusTarget =
  | { kind: 'track'; trackId: string; nonce: number }
  | { kind: 'stage'; stageId: string; nonce: number }
  | { kind: 'point'; pointId: string; nonce: number };

export type MapEditMode =
  | { kind: 'place_point'; name: string; category: PointCategory }
  | { kind: 'draw_zone'; name: string; category: ZoneCategory; vertices: LngLatAlt[] }
  | null;
