import type { LngLatAlt } from '../types';

export interface OsrmRoute {
  distance: number;   // metres
  duration: number;   // seconds
  geometry: GeoJSON.LineString;
}

export interface OsrmResult {
  routes: OsrmRoute[];
}

/**
 * Query the public OSRM demo server for driving routes between waypoints.
 * Returns up to 3 alternatives when alternatives=true.
 * Rate-limited by the public server; fine for manual use.
 */
export async function queryOsrm(
  waypoints: LngLatAlt[],
  alternatives = true,
): Promise<OsrmResult> {
  if (waypoints.length < 2) throw new Error('Need at least 2 waypoints');
  const coords = waypoints.map((w) => `${w[0]},${w[1]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=${alternatives ? 'true' : 'false'}&overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { code: string; routes?: OsrmRoute[] };
  if (json.code !== 'Ok') throw new Error(`OSRM: ${json.code}`);
  return { routes: json.routes ?? [] };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}
