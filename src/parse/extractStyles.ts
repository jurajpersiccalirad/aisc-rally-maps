import { kmlColorToHex } from '../lib/color';

export interface StyleEntry {
  iconColorHex?: string;
  iconHref?: string;
  iconScale?: number;
  lineColorHex?: string;
  polyColorHex?: string;
}

function styleEntryFromElement(el: Element): StyleEntry {
  const entry: StyleEntry = {};

  const iconStyle = el.getElementsByTagName('IconStyle')[0];
  if (iconStyle) {
    const colorEl = iconStyle.getElementsByTagName('color')[0];
    entry.iconColorHex = kmlColorToHex(colorEl?.textContent ?? undefined);
    const scaleEl = iconStyle.getElementsByTagName('scale')[0];
    if (scaleEl?.textContent) entry.iconScale = Number(scaleEl.textContent);
    const hrefEl = iconStyle.getElementsByTagName('href')[0];
    if (hrefEl?.textContent) entry.iconHref = hrefEl.textContent.trim();
  }

  const lineStyle = el.getElementsByTagName('LineStyle')[0];
  if (lineStyle) {
    const colorEl = lineStyle.getElementsByTagName('color')[0];
    entry.lineColorHex = kmlColorToHex(colorEl?.textContent ?? undefined);
  }

  const polyStyle = el.getElementsByTagName('PolyStyle')[0];
  if (polyStyle) {
    const colorEl = polyStyle.getElementsByTagName('color')[0];
    entry.polyColorHex = kmlColorToHex(colorEl?.textContent ?? undefined);
  }

  return entry;
}

/**
 * Resolve KML `<Style>` and `<StyleMap>` definitions into a flat lookup by id.
 * StyleMap entries with a `normal` pair are resolved one level into the
 * underlying Style.
 */
export function extractStyles(doc: Document): Map<string, StyleEntry> {
  const styles = new Map<string, StyleEntry>();

  for (const el of Array.from(doc.getElementsByTagName('Style'))) {
    const id = el.getAttribute('id');
    if (!id) continue;
    styles.set(id, styleEntryFromElement(el));
  }

  for (const sm of Array.from(doc.getElementsByTagName('StyleMap'))) {
    const id = sm.getAttribute('id');
    if (!id) continue;
    const pairs = Array.from(sm.getElementsByTagName('Pair'));
    const normal =
      pairs.find(
        (p) => p.getElementsByTagName('key')[0]?.textContent === 'normal',
      ) ?? pairs[0];
    if (!normal) continue;
    const refRaw =
      normal.getElementsByTagName('styleUrl')[0]?.textContent?.trim() ?? '';
    const ref = refRaw.startsWith('#') ? refRaw.slice(1) : refRaw;
    const resolved = styles.get(ref);
    if (resolved) styles.set(id, resolved);
  }

  return styles;
}

/** Resolve a `<styleUrl>#foo</styleUrl>` text to its entry. */
export function lookupStyle(
  styles: Map<string, StyleEntry>,
  styleUrl: string,
): StyleEntry | undefined {
  const id = styleUrl.startsWith('#') ? styleUrl.slice(1) : styleUrl;
  return styles.get(id);
}
