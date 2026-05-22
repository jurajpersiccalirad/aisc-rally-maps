import { describe, expect, it } from 'vitest';
import { classifyPoint } from '../../src/classify/pointCategory';
import type { PointCategory } from '../../src/types';

interface Case {
  name?: string;
  description?: string;
  styleUrl?: string;
  expected: PointCategory;
}

const cases: Case[] = [
  // Severn Valley (English)
  { name: 'SSS 1/5', expected: 'start' },
  { name: 'Start SS3', expected: 'start' },
  { name: 'FF SS2/5', expected: 'finish' },
  { name: 'FF1/5',   expected: 'finish' },   // digit immediately after FF
  { name: 'FF2',     expected: 'finish' },
  { name: 'Stop SS1/5', expected: 'stop' },
  { name: 'ATC SS1/5', expected: 'atc' },
  { name: 'PC A / PC D', expected: 'pc' },
  { name: 'Refuel Area (Friday only)', expected: 'refuel' },
  { name: 'Scrutineering (in shed)', expected: 'scrutineering' },
  { name: 'Trailer Park', expected: 'other' },
  { name: 'Noise', expected: 'other' },

  // Sierra Morena (Spanish) — payload mostly in <description>
  {
    description: 'CORTE x SALIDA O.F.P. "VILLANUEVA DEL REY"',
    expected: 'start',
  },
  {
    description: 'CORTE x META O.F.P. "VILLANUEVA DEL REY"',
    expected: 'finish',
  },
  { description: 'CORTE "INT.1" S.S. "OBEJO"', expected: 'intermediate' },
  { description: 'CORTE "INT.4" S.S. "MONTORO"', expected: 'intermediate' },
  {
    description: 'CORTE PARA RESIDENTES x SALIDA S.S. "OBEJO"',
    expected: 'start',
  },
  { description: 'CORTE PARA RESIDENCIA x META S.S. "ESPIEL"', expected: 'finish' },

  // Czech-flavoured (hypothetical, but rules cover it)
  { name: 'Start RZ 1', expected: 'start' },
  { name: 'Cíl RZ 1', expected: 'finish' },
  { name: 'Stop RZ 1', expected: 'stop' },

  // styleUrl-driven fallbacks
  { name: '', styleUrl: '#start_icon_orange', expected: 'start' },
  { name: '', styleUrl: '#finish_icon_blue', expected: 'finish' },

  // Ambiguity protection — "TC" only when isolated
  { name: 'TC SS1', expected: 'atc' },
  { name: 'BTC office', expected: 'other' },

  // Feedback: bare SS reference → start when no better keyword
  { name: 'SS1', expected: 'start' },
  { name: 'SS 2/5', expected: 'start' },
  { name: 'SS3-4', expected: 'start' },
  // Should NOT override more specific rules
  { name: 'SS1 Stop Control', expected: 'stop' },
  { name: 'SS2 FF', expected: 'finish' },
  { name: 'SS3 TC', expected: 'atc' },
  { name: 'SS4 Chicane', expected: 'chicane' },
];

describe('classifyPoint', () => {
  it.each(cases)(
    'classifies "$name / $description / $styleUrl" as $expected',
    ({ name = '', description, styleUrl, expected }) => {
      expect(classifyPoint({ name, description, styleUrl })).toBe(expected);
    },
  );
});
