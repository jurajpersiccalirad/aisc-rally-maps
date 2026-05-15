import type { PointCategory } from '../types';

export interface CategoryMeta {
  label: string;
  glyph: string;
  color: string;
  textOnColor: string;
}

/**
 * Visual metadata for each point category — used by map markers, sidebar
 * badges, and category dropdowns. Colors picked to be distinguishable on OSM
 * tiles; glyphs are single chars so they fit in a 16-px marker.
 */
export const CATEGORY_META: Record<PointCategory, CategoryMeta> = {
  start: { label: 'Start', glyph: 'S', color: '#16a34a', textOnColor: '#fff' },
  finish: { label: 'Finish', glyph: 'F', color: '#2563eb', textOnColor: '#fff' },
  flying_finish: {
    label: 'Flying finish',
    glyph: '⚑',
    color: '#7c3aed',
    textOnColor: '#fff',
  },
  stop: { label: 'Stop', glyph: '■', color: '#dc2626', textOnColor: '#fff' },
  atc: { label: 'ATC', glyph: 'A', color: '#f59e0b', textOnColor: '#111' },
  pc: { label: 'PC', glyph: 'P', color: '#eab308', textOnColor: '#111' },
  sss: { label: 'SSS', glyph: '★', color: '#0d9488', textOnColor: '#fff' },
  intermediate: {
    label: 'Intermediate',
    glyph: 'I',
    color: '#ec4899',
    textOnColor: '#fff',
  },
  radio: { label: 'Radio', glyph: 'R', color: '#06b6d4', textOnColor: '#fff' },
  ambulance: {
    label: 'Ambulance',
    glyph: '+',
    color: '#ffffff',
    textOnColor: '#dc2626',
  },
  refuel: {
    label: 'Refuel',
    glyph: '⛽',
    color: '#92400e',
    textOnColor: '#fff',
  },
  scrutineering: {
    label: 'Scrutineering',
    glyph: '⚙',
    color: '#475569',
    textOnColor: '#fff',
  },
  other: { label: 'Other', glyph: '•', color: '#94a3b8', textOnColor: '#111' },
};

export const CATEGORY_ORDER: PointCategory[] = [
  'start',
  'sss',
  'finish',
  'flying_finish',
  'stop',
  'intermediate',
  'atc',
  'pc',
  'radio',
  'ambulance',
  'refuel',
  'scrutineering',
  'other',
];
