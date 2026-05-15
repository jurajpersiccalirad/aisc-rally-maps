import { CATEGORY_META } from '../classify/categoryMeta';
import type { PointCategory } from '../types';

export function PointCategoryBadge({
  category,
  showLabel = true,
}: {
  category: PointCategory;
  showLabel?: boolean;
}) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: meta.color, color: meta.textOnColor }}
    >
      <span aria-hidden>{meta.glyph}</span>
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}
