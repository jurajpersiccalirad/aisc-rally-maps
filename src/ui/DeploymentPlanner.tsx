import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bearing as turfBearing,
  destination as turfDestination,
  distance as turfDistance,
  lineString,
  point as turfPoint,
  pointToLineDistance,
} from '@turf/turf';
import type { LngLatAlt, ParsedPoint } from '../types';
import { CATEGORY_META, FACILITY_CATEGORIES } from '../classify/categoryMeta';
import {
  effectiveCategory,
  getStageDerivedGeometry,
  getStageAssignedPoints,
} from '../state/selectors';
import { useProject } from '../state/useProject';
import { formatDistance, formatDuration, queryOsrm, type OsrmRoute } from '../lib/osrm';

// ── types ─────────────────────────────────────────────────────────────────────

interface Stop {
  id: string;
  pointId: string;
}

interface StageSchedule {
  stageId: string;
  stageName: string;
  startTime: string;
}

interface ClosureParams {
  publicMinutes: number;
  orgMinutes: number;
  safetyMinutes: number;
  role: 'public' | 'org' | 'safety';
}

interface RoutedLeg {
  from: string;
  to: string;
  /** Route A goes explicitly along the nearby stage (via stage waypoints). */
  routeA: OsrmRoute | null;
  /** Route B goes around the stage via a perpendicular-offset waypoint. */
  routeB: OsrmRoute | null;
  /** Name of the stage used for routing decisions, or null if no stage nearby. */
  viaStage: string | null;
  error: string | null;
}

interface StageGeo {
  id: string;
  name: string;
  coords: LngLatAlt[];
  color: string;
}

const DEFAULT_CLOSURE: ClosureParams = {
  publicMinutes: 120,
  orgMinutes: 60,
  safetyMinutes: 30,
  role: 'org',
};

const IMPORTANT_CATS = new Set(['start', 'finish', 'stop', 'atc']);

function effectiveClosureMinutes(p: ClosureParams): number {
  if (p.role === 'public') return p.publicMinutes;
  if (p.role === 'safety') return p.safetyMinutes;
  return p.orgMinutes;
}

let stopSeq = 0;
function newStop(pointId: string): Stop {
  return { id: `stop-${++stopSeq}`, pointId };
}

function pointLabel(p: ParsedPoint): string {
  const cat = effectiveCategory(p);
  return `${p.name || CATEGORY_META[cat].label} (${CATEGORY_META[cat].label})`;
}

function safeUntil(stageStartTime: string, closureMinutes: number, date: string): Date {
  const [h, m] = stageStartTime.split(':').map(Number);
  const start = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  return new Date(start.getTime() - closureMinutes * 60_000);
}

// ── routing helpers ───────────────────────────────────────────────────────────

/** Sample N evenly-spaced coords from a polyline (always includes first+last). */
function sampleCoords(coords: LngLatAlt[], n: number): LngLatAlt[] {
  if (coords.length <= n) return coords;
  const result: LngLatAlt[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / (n - 1)) * (coords.length - 1));
    result.push(coords[idx]);
  }
  return result;
}

/** Find the stage whose polyline is nearest to the midpoint of a leg, within maxKm. */
function findNearbyStage(
  from: LngLatAlt,
  to: LngLatAlt,
  stages: StageGeo[],
  maxKm = 8,
): StageGeo | null {
  const mid = turfPoint([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
  let best: StageGeo | null = null;
  let bestDist = maxKm;
  for (const s of stages) {
    if (s.coords.length < 2) continue;
    const line = lineString(s.coords.map((c) => [c[0], c[1]]));
    const d = pointToLineDistance(mid, line, { units: 'kilometers' });
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

/**
 * Build waypoints for a route that explicitly follows the stage.
 * Determines stage direction by comparing distances from `from` to
 * the stage start vs end — routes start-to-end or end-to-start accordingly.
 */
function viaStageWaypoints(
  from: LngLatAlt,
  stage: StageGeo,
  to: LngLatAlt,
): LngLatAlt[] {
  const start = stage.coords[0];
  const end = stage.coords[stage.coords.length - 1];
  const fromPt = turfPoint([from[0], from[1]]);
  const dStart = turfDistance(fromPt, turfPoint([start[0], start[1]]), { units: 'kilometers' });
  const dEnd = turfDistance(fromPt, turfPoint([end[0], end[1]]), { units: 'kilometers' });
  const ordered = dEnd < dStart ? [...stage.coords].reverse() : stage.coords;
  // 6 sampled interior points keeps well under OSRM's 25-waypoint limit
  const sampled = sampleCoords(ordered, 8).slice(1, -1);
  return [from, ...sampled, to];
}

/**
 * Build waypoints for a route that avoids the stage by detouring through
 * a point offset ~3 km perpendicular to the stage midpoint, on the side
 * furthest from the direct from→to line.
 */
function avoidStageWaypoints(
  from: LngLatAlt,
  stage: StageGeo,
  to: LngLatAlt,
): LngLatAlt[] {
  const midIdx = Math.floor(stage.coords.length / 2);
  const midPt = stage.coords[midIdx];
  const prevPt = stage.coords[Math.max(0, midIdx - 1)];
  const stageBearing = turfBearing(
    turfPoint([prevPt[0], prevPt[1]]),
    turfPoint([midPt[0], midPt[1]]),
  );
  const OFFSET_KM = 3;
  const offA = turfDestination(turfPoint([midPt[0], midPt[1]]), OFFSET_KM, (stageBearing + 90) % 360, { units: 'kilometers' });
  const offB = turfDestination(turfPoint([midPt[0], midPt[1]]), OFFSET_KM, (stageBearing - 90 + 360) % 360, { units: 'kilometers' });
  // Pick the offset that is furthest from the midpoint of the direct from→to line
  const directMid = turfPoint([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
  const dA = turfDistance(directMid, offA, { units: 'kilometers' });
  const dB = turfDistance(directMid, offB, { units: 'kilometers' });
  const off = dA > dB ? offA : offB;
  const offCoord: LngLatAlt = [off.geometry.coordinates[0], off.geometry.coordinates[1]];
  return [from, offCoord, to];
}

// ── map ───────────────────────────────────────────────────────────────────────

interface RouteMapProps {
  legs: RoutedLeg[];
  stops: Stop[];
  allPoints: ParsedPoint[];
  stageGeos: StageGeo[];
  importantPoints: ParsedPoint[];
  hiddenLegs: Set<number>;
  hiddenStageIds: Set<string>;
}

function RouteMap({ legs, stops, allPoints, stageGeos, importantPoints, hiddenLegs, hiddenStageIds }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const layersRef = useRef<unknown[]>([]);

  useEffect(() => {
    void (async () => {
      const L = (await import('leaflet')).default;
      if (!mapRef.current || mapInstanceRef.current) return;
      const map = L.map(mapRef.current, { zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      mapInstanceRef.current = map;
    })();
    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove(): void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current as ReturnType<typeof L.map> | null;
      if (!map) return;

      for (const layer of layersRef.current) (layer as { remove(): void }).remove();
      layersRef.current = [];

      const bounds: [number, number][] = [];

      // ── Stage polylines ────────────────────────────────────────────────────
      for (const stage of stageGeos) {
        if (stage.coords.length < 2 || hiddenStageIds.has(stage.id)) continue;
        const latlngs = stage.coords.map(([lng, lat]) => [lat, lng] as [number, number]);
        bounds.push(...latlngs);
        const poly = L.polyline(latlngs, {
          color: stage.color,
          weight: 5,
          opacity: 0.55,
        }).bindTooltip(stage.name, { permanent: false, direction: 'center' }).addTo(map);
        layersRef.current.push(poly);

        // Stage name label at midpoint
        const mid = latlngs[Math.floor(latlngs.length / 2)];
        const label = L.marker(mid, {
          icon: L.divIcon({
            html: `<div style="background:rgba(255,255,255,0.9);border:1px solid ${stage.color};border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700;color:${stage.color};white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.2)">${stage.name}</div>`,
            className: '',
            iconAnchor: [0, 0],
          }),
          interactive: false,
        }).addTo(map);
        layersRef.current.push(label);
      }

      // ── Important stage points ─────────────────────────────────────────────
      for (const p of importantPoints) {
        const [lng, lat] = p.coord;
        bounds.push([lat, lng]);
        const cat = effectiveCategory(p);
        const meta = CATEGORY_META[cat];
        const icon = L.divIcon({
          html: `<div style="background:${meta.color};color:${meta.textOnColor};border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;border:1.5px solid rgba(0,0,0,0.3);box-shadow:0 1px 2px rgba(0,0,0,0.3)">${meta.glyph}</div>`,
          className: '',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const marker = L.marker([lat, lng], { icon })
          .bindTooltip(`${meta.label}: ${p.name || '(unnamed)'}`)
          .addTo(map);
        layersRef.current.push(marker);
      }

      // ── Route legs ─────────────────────────────────────────────────────────
      legs.forEach((leg, i) => {
        if (hiddenLegs.has(i)) return;
        if (leg.routeA?.geometry) {
          const coords = leg.routeA.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          const line = L.polyline(coords, { color: '#2563eb', weight: 3, opacity: 0.85 }).addTo(map);
          layersRef.current.push(line);
          bounds.push(...coords);
        }
        if (leg.routeB?.geometry) {
          const coords = leg.routeB.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          const line = L.polyline(coords, { color: '#dc2626', weight: 3, opacity: 0.6, dashArray: '6 4' }).addTo(map);
          layersRef.current.push(line);
        }
      });

      // ── Numbered stop markers ──────────────────────────────────────────────
      stops.forEach((stop, idx) => {
        const point = allPoints.find((p) => p.id === stop.pointId);
        if (!point) return;
        const [lng, lat] = point.coord;
        bounds.push([lat, lng]);
        const num = idx === 0 ? '⌂' : String(idx);
        const icon = L.divIcon({
          html: `<div style="background:#1e293b;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${num}</div>`,
          className: '',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const marker = L.marker([lat, lng], { icon })
          .bindTooltip(`${num}: ${pointLabel(point)}`)
          .addTo(map);
        layersRef.current.push(marker);
      });

      if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
    })();
  }, [legs, stops, allPoints, stageGeos, importantPoints, hiddenLegs, hiddenStageIds]);

  return <div ref={mapRef} className="w-full rounded border border-slate-200 z-0" style={{ height: '520px' }} />;
}

// ── main component ────────────────────────────────────────────────────────────

// Distinct colours for stages when KML has no style colour
const STAGE_COLOURS = ['#e11d48','#d97706','#16a34a','#2563eb','#7c3aed','#0891b2','#ea580c','#84cc16'];

export function DeploymentPlanner({ onClose }: { onClose: () => void }) {
  const state = useProject();
  const allPoints = state.points;

  const [originId, setOriginId] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [schedule, setSchedule] = useState<StageSchedule[]>(() =>
    state.stages.map((s) => ({ stageId: s.id, stageName: s.exportName, startTime: '10:00' })),
  );
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [closure, setClosure] = useState<ClosureParams>(DEFAULT_CLOSURE);
  const [legs, setLegs] = useState<RoutedLeg[]>([]);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [hiddenLegs, setHiddenLegs] = useState<Set<number>>(new Set());
  const [hiddenStageIds, setHiddenStageIds] = useState<Set<string>>(new Set());

  const closureMinutes = effectiveClosureMinutes(closure);

  // Stage geometries for map overlay
  const stageGeos = useMemo((): StageGeo[] =>
    state.stages.map((s, i) => {
      const coords = getStageDerivedGeometry(state, s.id) ?? [];
      const track = state.tracks.find((t) => t.id === s.legs[0]?.trackId);
      return {
        id: s.id,
        name: s.exportName,
        coords,
        color: track?.styleColorHex ?? STAGE_COLOURS[i % STAGE_COLOURS.length],
      };
    }).filter((s) => s.coords.length >= 2),
  [state]);

  // Important points across all stages: start, finish, stop, TC
  const importantPoints = useMemo((): ParsedPoint[] => {
    const seen = new Set<string>();
    return state.stages.flatMap((s) =>
      getStageAssignedPoints(state, s.id)
        .filter((p) => IMPORTANT_CATS.has(effectiveCategory(p)) && !seen.has(p.id))
        .map((p) => { seen.add(p.id); return p; }),
    );
  }, [state]);

  const waypoints = useMemo((): { stop: Stop; point: ParsedPoint }[] => {
    const origin = allPoints.find((p) => p.id === originId);
    const result = origin ? [{ stop: { id: 'origin', pointId: originId }, point: origin }] : [];
    for (const s of stops) {
      const pt = allPoints.find((p) => p.id === s.pointId);
      if (pt) result.push({ stop: s, point: pt });
    }
    return result;
  }, [originId, stops, allPoints]);

  const calculateRoutes = async () => {
    if (waypoints.length < 2) return;
    setRouting(true);
    setRouteError(null);
    setHiddenLegs(new Set());
    const newLegs: RoutedLeg[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      try {
        const nearby = findNearbyStage(from.point.coord, to.point.coord, stageGeos);
        let routeA: OsrmRoute | null = null;
        let routeB: OsrmRoute | null = null;

        if (nearby) {
          // Route A: explicitly follows the stage road via sampled waypoints
          const wpA = viaStageWaypoints(from.point.coord, nearby, to.point.coord);
          const resA = await queryOsrm(wpA, 0);
          routeA = resA.routes[0] ?? null;

          // Route B: detours around the stage via a perpendicular-offset waypoint
          const wpB = avoidStageWaypoints(from.point.coord, nearby, to.point.coord);
          try {
            const resB = await queryOsrm(wpB, 0);
            routeB = resB.routes[0] ?? null;
          } catch {
            // If avoid-route fails (no road that side), fall back to OSRM alternatives
            const resFallback = await queryOsrm([from.point.coord, to.point.coord], 3);
            routeB = resFallback.routes[1] ?? resFallback.routes[0] ?? null;
          }
        } else {
          // No stage nearby — request up to 3 alternatives from OSRM
          const res = await queryOsrm([from.point.coord, to.point.coord], 3);
          routeA = res.routes[0] ?? null;
          routeB = res.routes[1] ?? null;
        }

        newLegs.push({
          from: pointLabel(from.point),
          to: pointLabel(to.point),
          routeA,
          routeB,
          viaStage: nearby?.name ?? null,
          error: null,
        });
      } catch (e) {
        newLegs.push({
          from: pointLabel(from.point),
          to: pointLabel(to.point),
          routeA: null, routeB: null,
          viaStage: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setLegs(newLegs);
    setRouting(false);
  };

  const moveStop = (idx: number, dir: -1 | 1) => {
    const next = [...stops];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setStops(next);
  };

  const toggleLeg = (idx: number) =>
    setHiddenLegs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });

  const departureTimes = useMemo(() => {
    const times: { departBy: Date | null; status: 'ok' | 'tight' | 'closed' }[] = [];
    let cumSeconds = 0;
    for (const leg of legs) {
      cumSeconds += leg.routeA?.duration ?? leg.routeB?.duration ?? 0;
      const closedAt = schedule.map((sch) => safeUntil(sch.startTime, closureMinutes, eventDate));
      const earliest = closedAt.length > 0 ? closedAt.reduce((a, b) => (a < b ? a : b)) : null;
      if (!earliest) { times.push({ departBy: null, status: 'ok' }); continue; }
      const arrival = new Date(Date.now() + cumSeconds * 1000);
      const status = arrival < earliest ? 'ok'
        : arrival < new Date(earliest.getTime() + 30 * 60_000) ? 'tight' : 'closed';
      times.push({ departBy: earliest, status });
    }
    return times;
  }, [legs, schedule, closureMinutes, eventDate]);

  // Combined stops array for the map (origin + visit stops)
  const mapStops = useMemo(() => {
    const result: Stop[] = [];
    if (originId) result.push({ id: 'origin', pointId: originId });
    result.push(...stops);
    return result;
  }, [originId, stops]);

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Deployment planner</h2>
        <button type="button" onClick={onClose}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
          ← Back to editor
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* Setup — condensed 3-col grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Visit sequence */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Visit sequence</h3>
              <select value={originId} onChange={(e) => setOriginId(e.target.value)}
                className="w-full text-xs rounded border border-slate-300 px-2 py-1.5">
                <option value="">— origin —</option>
                {allPoints.filter((p) => FACILITY_CATEGORIES.has(effectiveCategory(p)) && effectiveCategory(p) !== 'other').map((p) => (
                  <option key={p.id} value={p.id}>{pointLabel(p)}</option>
                ))}
                {allPoints.filter((p) => !FACILITY_CATEGORIES.has(effectiveCategory(p)) || effectiveCategory(p) === 'other').map((p) => (
                  <option key={p.id} value={p.id}>{pointLabel(p)}</option>
                ))}
              </select>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {stops.map((stop, idx) => {
                  const pt = allPoints.find((p) => p.id === stop.pointId);
                  return (
                    <div key={stop.id} className="flex items-center gap-1 text-xs rounded border border-slate-200 bg-white px-2 py-1">
                      <span className="text-slate-400 w-4 text-center shrink-0">{idx + 1}</span>
                      <span className="flex-1 truncate">{pt ? pointLabel(pt) : '—'}</span>
                      <button type="button" onClick={() => moveStop(idx, -1)} disabled={idx === 0}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => moveStop(idx, 1)} disabled={idx === stops.length - 1}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => setStops(stops.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-600">✕</button>
                    </div>
                  );
                })}
              </div>
              <select value="" onChange={(e) => { if (!e.target.value) return; setStops([...stops, newStop(e.target.value)]); (e.target as HTMLSelectElement).value = ''; }}
                className="w-full text-xs rounded border border-dashed border-slate-300 px-2 py-1.5">
                <option value="">+ Add stop…</option>
                {allPoints.filter((p) => p.id !== originId).map((p) => (
                  <option key={p.id} value={p.id}>{pointLabel(p)}</option>
                ))}
              </select>
            </div>

            {/* Stage schedule */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Stage schedule</h3>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                className="w-full text-xs rounded border border-slate-300 px-2 py-1.5" />
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {schedule.map((sch, i) => (
                  <label key={sch.stageId} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-700 w-14 truncate">{sch.stageName}</span>
                    <input type="time" value={sch.startTime}
                      onChange={(e) => { const n = [...schedule]; n[i] = { ...n[i], startTime: e.target.value }; setSchedule(n); }}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs" />
                  </label>
                ))}
              </div>
            </div>

            {/* Closure params */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Road closure window</h3>
              <div className="flex gap-1 flex-wrap">
                {(['public','org','safety'] as const).map((role) => (
                  <button key={role} type="button" onClick={() => setClosure((c) => ({ ...c, role }))}
                    className={['text-xs px-2 py-1 rounded border', closure.role === role ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-50'].join(' ')}>
                    {role === 'public' ? `Public −${closure.publicMinutes}m` : role === 'org' ? `Org −${closure.orgMinutes}m` : `Safety −${closure.safetyMinutes}m`}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs">
                {([['publicMinutes','Public'],['orgMinutes','Org'],['safetyMinutes','Safety']] as const).map(([key, lbl]) => (
                  <label key={key} className="block">
                    <span className="text-slate-500 text-[10px]">{lbl} (min)</span>
                    <input type="number" min={0} value={closure[key]}
                      onChange={(e) => setClosure((c) => ({ ...c, [key]: parseInt(e.target.value) || 0 }))}
                      className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs" />
                  </label>
                ))}
              </div>
              <button type="button" disabled={waypoints.length < 2 || routing}
                onClick={() => void calculateRoutes()}
                className="w-full text-xs px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed mt-2">
                {routing ? 'Calculating…' : `Calculate routes (${Math.max(0, waypoints.length - 1)} leg${waypoints.length !== 2 ? 's' : ''})`}
              </button>
            </div>
          </div>

          {routeError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{routeError}</div>
          )}

          {/* Map — always visible, tall */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-5 h-0.5 bg-blue-600 inline-block rounded" />
                Route A (via stage)
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-5 inline-block border-t-2 border-red-500 border-dashed" />
                Route B (avoid stage)
              </span>
              <span className="text-slate-300">|</span>
              {stageGeos.map((s) => {
                const hidden = hiddenStageIds.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setHiddenStageIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                      return next;
                    })}
                    className={['flex items-center gap-1 px-1.5 py-0.5 rounded border transition-opacity',
                      hidden ? 'opacity-40 border-slate-300' : 'border-transparent hover:bg-slate-100'].join(' ')}
                    title={hidden ? `Show ${s.name}` : `Hide ${s.name}`}
                  >
                    <span className="w-4 h-1 inline-block rounded" style={{ background: s.color }} />
                    <span style={{ color: s.color }} className="font-medium">{s.name}</span>
                  </button>
                );
              })}
            </div>
            <RouteMap
              legs={legs}
              stops={mapStops}
              allPoints={allPoints}
              stageGeos={stageGeos}
              importantPoints={importantPoints}
              hiddenLegs={hiddenLegs}
              hiddenStageIds={hiddenStageIds}
            />
          </div>

          {/* Route itinerary */}
          {legs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Itinerary</h3>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setHiddenLegs(new Set())}
                    className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">Show all</button>
                  <button type="button" onClick={() => setHiddenLegs(new Set(legs.map((_, i) => i)))}
                    className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">Hide all</button>
                </div>
              </div>
              <ul className="space-y-1.5">
                {legs.map((leg, i) => {
                  const timing = departureTimes[i];
                  const hidden = hiddenLegs.has(i);
                  const statusColor = hidden ? 'border-slate-200 bg-white opacity-50'
                    : !timing || timing.status === 'ok' ? 'border-slate-200 bg-white'
                      : timing.status === 'tight' ? 'border-amber-200 bg-amber-50'
                        : 'border-red-200 bg-red-50';
                  return (
                    <li key={i} className={`rounded border px-3 py-2 text-xs ${statusColor}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-700">
                          Leg {i + 1}: {leg.from} → {leg.to}
                        </span>
                        <button type="button" onClick={() => toggleLeg(i)}
                          className={['px-2 py-0.5 rounded border text-[11px]', hidden ? 'bg-slate-100 border-slate-300 text-slate-500' : 'border-blue-300 text-blue-700 hover:bg-blue-50'].join(' ')}
                          title={hidden ? 'Show on map' : 'Hide from map'}>
                          {hidden ? '○ Hidden' : '● Visible'}
                        </button>
                      </div>
                      {leg.error ? (
                        <p className="text-red-700 mt-1">Routing failed: {leg.error}</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-x-4 mt-1 text-slate-600">
                          {leg.routeA && <>
                            <span className="text-blue-700 font-medium">
                              {leg.viaStage ? `Via ${leg.viaStage}` : 'Route A'}
                            </span>
                            <span>{formatDistance(leg.routeA.distance)} · {formatDuration(leg.routeA.duration)}</span>
                          </>}
                          {leg.routeB && <>
                            <span className="text-red-600 font-medium">
                              {leg.viaStage ? `Avoid ${leg.viaStage}` : 'Route B'}
                            </span>
                            <span>{formatDistance(leg.routeB.distance)} · {formatDuration(leg.routeB.duration)}</span>
                          </>}
                          {timing?.departBy && <><span className="font-medium">Close at</span><span>{timing.departBy.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></>}
                        </div>
                      )}
                      {timing?.status === 'tight' && <p className="text-amber-800 mt-1">⚠ Tight — use Route B or depart earlier.</p>}
                      {timing?.status === 'closed' && <p className="text-red-800 mt-1">✗ Stage closes before arrival — use Route B.</p>}
                    </li>
                  );
                })}
              </ul>
              {legs.every((l) => l.routeA || l.routeB) && (
                <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold">Total (Route A): </span>
                  {formatDistance(legs.reduce((s, l) => s + (l.routeA?.distance ?? l.routeB?.distance ?? 0), 0))}
                  {' · '}
                  {formatDuration(legs.reduce((s, l) => s + (l.routeA?.duration ?? l.routeB?.duration ?? 0), 0))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
