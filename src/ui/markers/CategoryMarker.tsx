import L from 'leaflet';
import { CATEGORY_META } from '../../classify/categoryMeta';
import type { PointCategory } from '../../types';

const ICON_CACHE = new Map<string, L.DivIcon>();

export function categoryDivIcon(
  category: PointCategory,
  emphasized = false,
): L.DivIcon {
  const key = `${category}:${emphasized ? '1' : '0'}`;
  const cached = ICON_CACHE.get(key);
  if (cached) return cached;
  const meta = CATEGORY_META[category];
  const size = emphasized ? 22 : 18;
  const icon = L.divIcon({
    className: 'aisc-category-marker',
    html: `<span style="
      display:flex;
      align-items:center;
      justify-content:center;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:${meta.color};
      color:${meta.textOnColor};
      border:2px solid white;
      box-shadow:0 0 0 1px rgba(0,0,0,0.35);
      font-size:${emphasized ? 12 : 10}px;
      font-weight:700;
      line-height:1;
      font-family:system-ui,sans-serif;
    ">${meta.glyph}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  ICON_CACHE.set(key, icon);
  return icon;
}
