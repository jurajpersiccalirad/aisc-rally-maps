import type { PointCategory } from '../types';

export interface CategoryMeta {
  label: string;
  glyph: string;
  color: string;
  textOnColor: string;
}

export const CATEGORY_META: Record<PointCategory, CategoryMeta> = {
  start:        { label: 'Start',          glyph: 'S',  color: '#16a34a', textOnColor: '#fff' },
  finish:       { label: 'Finish',         glyph: 'F',  color: '#2563eb', textOnColor: '#fff' },
  stop:         { label: 'Stop control',   glyph: '■',  color: '#dc2626', textOnColor: '#fff' },
  atc:          { label: 'Time Control',   glyph: 'TC', color: '#f59e0b', textOnColor: '#111' },
  pc:           { label: 'PC',             glyph: 'P',  color: '#eab308', textOnColor: '#111' },
  intermediate: { label: 'Intermediate',   glyph: 'I',  color: '#ec4899', textOnColor: '#fff' },
  chicane:      { label: 'Chicane',        glyph: 'Z',  color: '#f97316', textOnColor: '#fff' },
  marshall:     { label: 'Marshall',       glyph: 'M',  color: '#fde047', textOnColor: '#111' },
  radio:        { label: 'Radio',          glyph: 'R',  color: '#06b6d4', textOnColor: '#fff' },
  ambulance:    { label: 'Ambulance',      glyph: '+',  color: '#ffffff', textOnColor: '#dc2626' },
  refuel:       { label: 'Refuel',         glyph: '⛽', color: '#92400e', textOnColor: '#fff' },
  scrutineering:{ label: 'Scrutineering',  glyph: '⚙', color: '#475569', textOnColor: '#fff' },
  other:        { label: 'Other',          glyph: '•',  color: '#94a3b8', textOnColor: '#111' },
};

export const CATEGORY_ORDER: PointCategory[] = [
  'start',
  'finish',
  'stop',
  'intermediate',
  'chicane',
  'atc',
  'pc',
  'marshall',
  'radio',
  'ambulance',
  'refuel',
  'scrutineering',
  'other',
];

/** Required control points that must be present on every stage. */
export const REQUIRED_STAGE_CATEGORIES: PointCategory[] = ['start', 'finish', 'stop'];
