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

interface RouteOption {
  label: string;
  route: OsrmRoute;
  color: string;
}

interface RoutedLeg {
  from: string;
  to: string;
  options: RouteOption[];
  viaStage: string | null;
  error: string | null;
}

const ROUTE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2'];

/** Deduplicate routes whose distances are within 3% of each other. */
function dedupeRoutes(routes: { label: string; route: OsrmRoute }[]): { label: string; route: OsrmRoute }[] {
  const out: { label: string; route: OsrmRoute }[] = [];
  for (const r of routes) {
    const dup = out.some((o) => Math.abs(o.route.distance - r.route.distance) / Math.max(o.route.distance, 1) < 0.03);
    if (!dup) out.push(r);
  }
  return out;
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


// ── map ───────────────────────────────────────────────────────────────────────

interface RouteMapProps {
  legs: RoutedLeg[];
  stops: Stop[];
  allPoints: ParsedPoint[];
  stageGeos: StageGeo[];
  importantPoints: ParsedPoint[];
  visibleRoutes: Map<string, boolean>;
  hiddenStageIds: Set<string>;
}

function RouteMap({ legs, stops, allPoints, stageGeos, importantPoints, visibleRoutes, hiddenStageIds }: RouteMapProps) {
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
      legs.forEach((leg, legIdx) => {
        leg.options.forEach((opt, routeIdx) => {
          const key = `${legIdx}-${routeIdx}`;
          const visible = visibleRoutes.get(key) ?? true;
          if (!visible || !opt.route.geometry) return;
          const coords = opt.route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          const isDashed = routeIdx > 0;
          const line = L.polyline(coords, {
            color: opt.color,
            weight: 3,
            opacity: 0.85,
            dashArray: isDashed ? '8 5' : undefined,
          }).bindTooltip(opt.label).addTo(map);
          layersRef.current.push(line);
          bounds.push(...coords);
        });
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
  }, [legs, stops, allPoints, stageGeos, importantPoints, visibleRoutes, hiddenStageIds]);

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
  // key: `${legIdx}-${routeIdx}`, value: visible
  const [visibleRoutes, setVisibleRoutes] = useState<Map<string, boolean>>(new Map());
  const [hiddenStageIds, setHiddenStageIds] = useState<Set<string>>(new Set());

  const isRouteVisible = (legIdx: number, routeIdx: number) => {
    const key = `${legIdx}-${routeIdx}`;
    return visibleRoutes.get(key) ?? true; // default visible
  };
  const toggleRoute = (legIdx: number, routeIdx: number) => {
    const key = `${legIdx}-${routeIdx}`;
    setVisibleRoutes((prev) => new Map(prev).set(key, !isRouteVisible(legIdx, routeIdx)));
  };

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
    setVisibleRoutes(new Map());
    const newLegs: RoutedLeg[] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const candidates: { label: string; route: OsrmRoute }[] = [];

      try {
        const nearby = findNearbyStage(from.point.coord, to.point.coord, stageGeos);

        // 1. OSRM direct + up to 3 alternatives (always try this)
        try {
          const res = await queryOsrm([from.point.coord, to.point.coord], 3);
          res.routes.forEach((r, idx) =>
            candidates.push({ label: idx === 0 ? 'Direct' : `Alternative ${idx}`, route: r }),
          );
        } catch { /* ignore */ }

        if (nearby) {
          // 2. Via stage: force routing through the stage road
          try {
            const wpVia = viaStageWaypoints(from.point.coord, nearby, to.point.coord);
            const res = await queryOsrm(wpVia, 0);
            if (res.routes[0]) candidates.push({ label: `Via ${nearby.name}`, route: res.routes[0] });
          } catch { /* ignore */ }

          // 3. Avoid stage: try perpendicular offsets at 2 / 4 / 6 km in both directions
          const midIdx = Math.floor(nearby.coords.length / 2);
          const midPt = nearby.coords[midIdx];
          const prevPt = nearby.coords[Math.max(0, midIdx - 1)];
          const stageBrg = turfBearing(turfPoint([prevPt[0], prevPt[1]]), turfPoint([midPt[0], midPt[1]]));
          for (const km of [2, 4, 6]) {
            for (const side of [90, -90]) {
              try {
                const off = turfDestination(turfPoint([midPt[0], midPt[1]]), km, (stageBrg + side + 360) % 360, { units: 'kilometers' });
                const offCoord: LngLatAlt = [off.geometry.coordinates[0], off.geometry.coordinates[1]];
                const res = await queryOsrm([from.point.coord, offCoord, to.point.coord], 0);
                if (res.routes[0]) candidates.push({ label: `Around ${nearby.name} (${km}km)`, route: res.routes[0] });
              } catch { /* ignore */ }
            }
          }
        }

        // Deduplicate and assign colours
        const unique = dedupeRoutes(candidates);
        const options: RouteOption[] = unique.map((c, idx) => ({
          label: c.label,
          route: c.route,
          color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
        }));

        newLegs.push({ from: pointLabel(from.point), to: pointLabel(to.point), options, viaStage: nearby?.name ?? null, error: null });
      } catch (e) {
        newLegs.push({ from: pointLabel(from.point), to: pointLabel(to.point), options: [], viaStage: null, error: e instanceof Error ? e.message : String(e) });
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

  const departureTimes = useMemo(() => {
    const times: { departBy: Date | null; status: 'ok' | 'tight' | 'closed' }[] = [];
    let cumSeconds = 0;
    for (const leg of legs) {
      cumSeconds += leg.options[0]?.route.duration ?? 0;
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
              visibleRoutes={visibleRoutes}
              hiddenStageIds={hiddenStageIds}
            />
          </div>

          {/* Route itinerary */}
          {legs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Itinerary</h3>
                <div className="flex gap-1">
                  <button type="button"
                    onClick={() => setVisibleRoutes(new Map())}
                    className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">Show all</button>
                  <button type="button"
                    onClick={() => {
                      const m = new Map<string, boolean>();
                      legs.forEach((leg, li) => leg.options.forEach((_, ri) => m.set(`${li}-${ri}`, false)));
                      setVisibleRoutes(m);
                    }}
                    className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">Hide all</button>
                </div>
              </div>
              <ul className="space-y-2">
                {legs.map((leg, legIdx) => {
                  const timing = departureTimes[legIdx];
                  const statusColor = !timing || timing.status === 'ok' ? 'border-slate-200 bg-white'
                    : timing.status === 'tight' ? 'border-amber-200 bg-amber-50'
                      : 'border-red-200 bg-red-50';
                  return (
                    <li key={legIdx} className={`rounded border px-3 py-2 text-xs ${statusColor}`}>
                      <div className="font-medium text-slate-700 mb-2">
                        Leg {legIdx + 1}: {leg.from} → {leg.to}
                        {leg.viaStage && <span className="ml-2 font-normal text-slate-500">(near {leg.viaStage})</span>}
                      </div>

                      {leg.error ? (
                        <p className="text-red-700">Routing failed: {leg.error}</p>
                      ) : leg.options.length === 0 ? (
                        <p className="text-slate-400 italic">No routes found.</p>
                      ) : (
                        <div className="space-y-1">
                          {leg.options.map((opt, routeIdx) => {
                            const visible = isRouteVisible(legIdx, routeIdx);
                            return (
                              <div key={routeIdx} className={['flex items-center gap-2 rounded px-2 py-1 border', visible ? 'border-transparent' : 'border-slate-200 opacity-50'].join(' ')}
                                style={{ background: visible ? opt.color + '18' : undefined }}>
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: opt.color }} />
                                <span className="font-medium flex-1" style={{ color: opt.color }}>{opt.label}</span>
                                <span className="text-slate-600">{formatDistance(opt.route.distance)} · {formatDuration(opt.route.duration)}</span>
                                <button type="button" onClick={() => toggleRoute(legIdx, routeIdx)}
                                  className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 hover:bg-white shrink-0">
                                  {visible ? 'Hide' : 'Show'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {timing?.departBy && (
                        <div className="mt-1.5 text-slate-500">
                          Stage closes at <span className="font-medium">{timing.departBy.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                          {timing.status === 'tight' && <span className="text-amber-700 ml-2">⚠ tight</span>}
                          {timing.status === 'closed' && <span className="text-red-700 ml-2">✗ too late</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
