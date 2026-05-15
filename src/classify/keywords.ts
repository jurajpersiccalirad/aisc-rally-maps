import type { PointCategory } from '../types';

export interface CategoryKeywords {
  category: PointCategory;
  /** Matches name and/or description (lower-cased before testing). */
  text?: RegExp;
  /** Matches raw `<styleUrl>` (lower-cased). */
  styleUrl?: RegExp;
}

/**
 * Ordered most-specific to least-specific. The first rule that matches wins.
 * Patterns are lower-cased; classifier supplies the casing.
 *
 * Languages covered: English, Spanish, Czech — matches what we've seen across
 * Severn Valley (UK), Sierra Morena (ES), and Czech rally KMLs.
 */
export const CATEGORY_KEYWORDS: CategoryKeywords[] = [
  {
    category: 'flying_finish',
    text: /flying|^ff\b|\bff\s+ss|fin\s+volante/,
  },
  {
    category: 'sss',
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
