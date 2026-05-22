import type { PointCategory } from '../types';

export interface CategoryKeywords {
  category: PointCategory;
  text?: RegExp;
  styleUrl?: RegExp;
}

/**
 * Ordered most-specific to least-specific. First match wins.
 * Patterns tested against lower-cased name + description.
 * Languages: English, Spanish, Czech.
 */
export const CATEGORY_KEYWORDS: CategoryKeywords[] = [
  {
    // Flying finish merged into finish (C26 extension) — flying finish is still
    // a finish line; distinguish only for marshal/safety planning if needed.
    category: 'finish',
    text: /flying|^ff\b|\bff\s+ss|fin\s+volante/,
  },
  {
    // SSS (Super Special Stage) merged into start (C26)
    category: 'start',
    text: /^sss\b|\bsss\s+\d|super\s+special/,
  },
  {
    category: 'start',
    text: /\bstart\b|\bsalida\b|\binicio\b|\bstartovac|\bstartov\b/,
    styleUrl: /start_|icon.*start/,
  },
  {
    category: 'finish',
    text: /\bfinish\b|\bmeta\b|\bc[íi]l\b/,
    styleUrl: /finish_/,
  },
  {
    category: 'stop',
    text: /^stop\b|\bstop\s+ss|sign\s+stop\s+red|se[ñn]a.*stop/,
    styleUrl: /stop_|sign.*stop/,
  },
  {
    category: 'chicane',
    text: /\bchicanes?\b|speed\s+control\s+chicane/,
  },
  {
    category: 'marshall',
    text: /\bmarshall?s?\b|\bofficial\s+point\b|\bmarshal\s+post\b/,
  },
  {
    category: 'intermediate',
    text: /\bint\.?\s*\d|\bintermedio\b|\bintermedi/,
  },
  {
    category: 'atc',
    text: /\batc\b|^tc\b|\btc\s+ss/,
  },
  {
    category: 'pc',
    text: /\bpc\b|punto\s+control|kontroln[ií].*stanovi[sš]t/,
  },
  {
    category: 'radio',
    text: /\bradio\b|\brp\b/,
  },
  {
    category: 'ambulance',
    text: /ambulan|sanitar/,
  },
  {
    category: 'refuel',
    text: /\brefuel\b|repostaje|tankov|\brefuelling\b/,
  },
  {
    category: 'scrutineering',
    text: /\bscrut|verifica|technick.*p[rř]ej/,
  },
];
