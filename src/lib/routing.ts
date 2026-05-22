import type { LngLatAlt } from '../types';
import type { OsrmResult } from './osrm';
import { queryOsrm } from './osrm';

export type RoutingProvider = 'osrm' | 'google';

export const GOOGLE_KEY_LS = 'aisc_google_routes_key';

// ── Google polyline decoder ───────────────────────────────────────────────────

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lng / 1e5, lat / 1e5]); // [lng, lat] matches GeoJSON
  }
  return coords;
}

// ── Google Routes API v2 ──────────────────────────────────────────────────────

interface GoogleRoute {
  distanceMeters: number;
  duration: string; // e.g. "1234s"
  polyline: { encodedPolyline: string };
}

export async function queryGoogleRoutes(
  waypoints: LngLatAlt[],
  alternatives: boolean,
  apiKey: string,
): Promise<OsrmResult> {
  if (waypoints.length < 2) throw new Error('Need at least 2 waypoints');

  const toLatLng = (w: LngLatAlt) => ({ latitude: w[1], longitude: w[0] });
  const body = {
    origin: { location: { latLng: toLatLng(waypoints[0]) } },
    destination: { location: { latLng: toLatLng(waypoints[waypoints.length - 1]) } },
    intermediates: waypoints.slice(1, -1).map((w) => ({ location: { latLng: toLatLng(w) } })),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    computeAlternativeRoutes: alternatives,
    polylineQuality: 'OVERVIEW',
  };

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Google Routes API error ${res.status}: ${err.error?.message ?? res.statusText}`);
  }

  const data = (await res.json()) as { routes?: GoogleRoute[] };
  const routes = (data.routes ?? []).map((r) => ({
    distance: r.distanceMeters,
    duration: parseInt(r.duration.replace('s', ''), 10),
    geometry: {
      type: 'LineString' as const,
      coordinates: decodePolyline(r.polyline.encodedPolyline),
    },
  }));

  return { routes };
}

// ── Unified entry point ───────────────────────────────────────────────────────

export async function routeWaypoints(
  waypoints: LngLatAlt[],
  alternatives: number | boolean,
  provider: RoutingProvider,
  googleApiKey?: string,
): Promise<OsrmResult> {
  if (provider === 'google') {
    if (!googleApiKey) throw new Error('Google API key not set — enter it in Settings.');
    return queryGoogleRoutes(waypoints, Boolean(alternatives), googleApiKey);
  }
  return queryOsrm(waypoints, alternatives);
}
