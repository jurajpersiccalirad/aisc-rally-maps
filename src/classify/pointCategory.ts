import type { PointCategory } from '../types';
import { CATEGORY_KEYWORDS } from './keywords';

export interface ClassifyInput {
  name: string;
  description?: string;
  styleUrl?: string;
}

export function classifyPoint(input: ClassifyInput): PointCategory {
  const text = `${input.name ?? ''} ${input.description ?? ''}`
    .toLowerCase()
    .trim();
  const styleUrl = (input.styleUrl ?? '').toLowerCase();
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.text && rule.text.test(text)) return rule.category;
    if (rule.styleUrl && styleUrl && rule.styleUrl.test(styleUrl)) {
      return rule.category;
    }
  }
  return 'other';
}
