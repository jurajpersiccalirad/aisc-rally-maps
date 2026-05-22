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
    // Stop control — \bstop (no trailing \b) so "STOP2/6", "STOP1" also match.
    // Left boundary prevents matching inside words like "unstoppable".
    category: 'stop',
    text: /\bstop|sign\s+stop\s+red|se[ñn]a.*stop/,
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
    // ATC / TC — no trailing \b so "ATC2/6", "TC1/5" also match
    category: 'atc',
    text: /\batc|\btc/,
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
    category: 'service_park',
    text: /\bservice\s+park\b|\bservicio\s+parque\b|\bservisn[ií]\s+park\b|\bservis\s+park\b/,
  },
  {
    category: 'hq',
    text: /\bhq\b|\bheadquarters\b|\brally\s+control\b|\brally\s+hq\b|\brally\s+centre\b|\bcentro\s+rally\b/,
  },
  {
    category: 'parc_ferme',
    text: /\bparc\s+ferm[eé]\b|\bparc\b.*ferm|\bpf\b/,
  },
  {
    // Fallback: bare stage reference "SS1", "SS 2/5", "SS3-4" with no other
    // keyword — treat as start. Placed last so specific rules above win first.
    category: 'start',
    text: /\bss\s*\d/,
  },
];
