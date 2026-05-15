/**
 * KML colors are encoded as 8 hex chars in `aabbggrr` order (alpha, blue, green, red).
 * Mirrors `kmz_extractor.py:873-879` in the original Python CLI.
 */
export function kmlColorToHex(kmlColor: string | undefined): string | undefined {
  if (!kmlColor) return undefined;
  const c = kmlColor.trim().toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(c)) return undefined;
  const bb = c.slice(2, 4);
  const gg = c.slice(4, 6);
  const rr = c.slice(6, 8);
  return `#${rr}${gg}${bb}`;
}
