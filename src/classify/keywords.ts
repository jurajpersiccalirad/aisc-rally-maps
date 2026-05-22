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
 *
 * NOTE: avoid ^ anchors — point names commonly carry a stage prefix,
 * e.g. "SS2 Stop Control" or "SS1 FF". Use \b word-boundary matches instead.
 */
export const CATEGORY_KEYWORDS: CategoryKeywords[] = [
  {
    // Flying finish → finish.
    // \bff (no trailing \b) so "FF1/5", "FF2" also match — the digit after FF
    // is a word char so \bff\b would miss it. Left boundary \b prevents matching
    // inside words like "officer" or "traffic".
    category: 'finish',
    text: /\bflying\b|\bff|fin\s+volante/,
  },
  {
    // SSS / Super Special Stage → start
    category: 'start',
    text: /\bsss\b|super\s+special/,
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
    // Stop control — \bstop\b anywhere; "SS2 Stop Control", "STOP SS3", etc.
    category: 'stop',
    text: /\bstop\b|sign\s+stop\s+red|se[ñn]a.*stop/,
    styleUrl: /stop_|sign.*stop/,
  },
  {
    // Chicane — word boundary so "SS1 Chicane A" and "Speed Chicane" both match
    category: 'chicane',
    text: /\bchicanes?\b|speed\s+control\s+chicane/,
  },
  {
    category: 'marshall',
    text: /\bmarshall?s?\b|\bmarshal\s+post\b/,
  },
  {
    category: 'intermediate',
    text: /\bint\.?\s*\d|\bintermedio\b|\bintermedi/,
  },
  {
    // ATC / TC — \btc\b anywhere (e.g. "SS1 TC", "TC SS2/5")
    category: 'atc',
    text: /\batc\b|\btc\b/,
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
  {
    // Fallback: bare stage reference "SS1", "SS 2/5", "SS3-4" with no other
    // keyword — treat as start. Placed last so specific rules above win first.
    category: 'start',
    text: /\bss\s*\d/,
  },
];
