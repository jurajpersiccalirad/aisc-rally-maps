export type CoordFormat = 'decimal' | 'dm' | 'dms';

function dir(deg: number, pos: 'N' | 'E'): string {
  return deg >= 0 ? pos : pos === 'N' ? 'S' : 'W';
}

function dmStr(deg: number, d: string): string {
  const abs = Math.abs(deg);
  const whole = Math.floor(abs);
  const min = (abs - whole) * 60;
  return `${whole}°${min.toFixed(3)}'${d}`;
}

function dmsStr(deg: number, d: string): string {
  const abs = Math.abs(deg);
  const whole = Math.floor(abs);
  const minFull = (abs - whole) * 60;
  const min = Math.floor(minFull);
  const sec = (minFull - min) * 60;
  return `${whole}°${String(min).padStart(2, '0')}'${sec.toFixed(1)}"${d}`;
}

export function formatCoord(lng: number, lat: number, format: CoordFormat): string {
  switch (format) {
    case 'dm':
      return `${dmStr(lat, dir(lat, 'N'))} ${dmStr(lng, dir(lng, 'E'))}`;
    case 'dms':
      return `${dmsStr(lat, dir(lat, 'N'))} ${dmsStr(lng, dir(lng, 'E'))}`;
    default:
      return `${Math.abs(lat).toFixed(5)}°${dir(lat, 'N')} ${Math.abs(lng).toFixed(5)}°${dir(lng, 'E')}`;
  }
}

export function parseCoordInput(input: string): [number, number] | null {
  const cleaned = input.replace(/[°'"]/g, ' ').replace(/,/g, ' ').trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  function parsePart(s: string): { val: number; neg: boolean } | null {
    const m = s.match(/^([NSEWnsew])?(-?\d+(?:\.\d+)?)([NSEWnsew])?$/);
    if (!m) return null;
    const val = parseFloat(m[2]);
    if (isNaN(val)) return null;
    const d = (m[1] || m[3] || '').toUpperCase();
    const neg = d === 'S' || d === 'W';
    return { val, neg };
  }

  const a = parsePart(tokens[0]);
  const b = parsePart(tokens[1]);
  if (!a || !b) return null;

  const lat = a.neg ? -a.val : a.val;
  const lng = b.neg ? -b.val : b.val;

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}
