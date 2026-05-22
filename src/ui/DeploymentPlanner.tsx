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
import { formatDistance, formatDuration } from '../lib/osrm';
import {
  GOOGLE_KEY_LS,
  routeWaypoints,
  type RoutingProvider,
} from '../lib/routing';
import type { OsrmRoute } from '../lib/osrm';

// ── types ─────────────────────────────────────────────────────────────────────

interface Stop { id: string; pointId: string }
interface StageSchedule { stageId: string; stageName: string; startTime: string }
interface ClosureParams { publicMinutes: number; orgMinutes: number; safetyMinutes: number; role: 'public' | 'org' | 'safety' }

interface RouteOption { label: string; route: OsrmRoute; color: string }
interface RoutedLeg { from: string; to: string; options: RouteOption[]; viaStage: string | null; error: string | null }
interface StageGeo { id: string; name: string; coords: LngLatAlt[]; color: string }

interface ScheduleEntry {
  stopIdx: number;         // 0 = origin
  label: string;
  arrive: Date | null;     // null for origin
  driveSeconds: number;    // drive time to reach here
  waitMinutes: number;
  depart: Date;
}

const DEFAULT_CLOSURE: ClosureParams = { publicMinutes: 120, orgMinutes: 60, safetyMinutes: 30, role: 'org' };
const IMPORTANT_CATS = new Set(['start', 'finish', 'stop', 'atc']);
const ROUTE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2'];
const STAGE_COLOURS = ['#e11d48','#d97706','#16a34a','#2563eb','#7c3aed','#0891b2','#ea580c','#84cc16'];

let stopSeq = 0;
const newStop = (pointId: string): Stop => ({ id: `stop-${++stopSeq}`, pointId });

const effectiveClosureMinutes = (p: ClosureParams) =>
  p.role === 'public' ? p.publicMinutes : p.role === 'safety' ? p.safetyMinutes : p.orgMinutes;

function pointLabel(p: ParsedPoint): string {
  const cat = effectiveCategory(p);
  return `${p.name || CATEGORY_META[cat].label} (${CATEGORY_META[cat].label})`;
}

function safeUntil(startTime: string, closureMin: number, date: string): Date {
  const [h, m] = startTime.split(':').map(Number);
  const s = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  return new Date(s.getTime() - closureMin * 60_000);
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dedupeRoutes(routes: { label: string; route: OsrmRoute }[]): typeof routes {
  const out: typeof routes = [];
  for (const r of routes) {
    if (!out.some((o) => Math.abs(o.route.distance - r.route.distance) / Math.max(o.route.distance, 1) < 0.03))
      out.push(r);
  }
  return out;
}

// ── routing helpers ───────────────────────────────────────────────────────────

function sampleCoords(coords: LngLatAlt[], n: number): LngLatAlt[] {
  if (coords.length <= n) return coords;
  return Array.from({ length: n }, (_, i) => coords[Math.round((i / (n - 1)) * (coords.length - 1))]);
}

function findNearbyStage(from: LngLatAlt, to: LngLatAlt, stages: StageGeo[], maxKm = 8): StageGeo | null {
  const mid = turfPoint([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
  let best: StageGeo | null = null, bestDist = maxKm;
  for (const s of stages) {
    if (s.coords.length < 2) continue;
    const d = pointToLineDistance(mid, lineString(s.coords.map((c) => [c[0], c[1]])), { units: 'kilometers' });
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

function viaStageWaypoints(from: LngLatAlt, stage: StageGeo, to: LngLatAlt): LngLatAlt[] {
  const start = stage.coords[0], end = stage.coords[stage.coords.length - 1];
  const fromPt = turfPoint([from[0], from[1]]);
  const ordered = turfDistance(fromPt, turfPoint([end[0], end[1]]), { units: 'kilometers' })
    < turfDistance(fromPt, turfPoint([start[0], start[1]]), { units: 'kilometers' })
    ? [...stage.coords].reverse() : stage.coords;
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
  focusedLeg: number | null;
}

function RouteMap({ legs, stops, allPoints, stageGeos, importantPoints, visibleRoutes, hiddenStageIds, focusedLeg }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const layersRef = useRef<unknown[]>([]);

  useEffect(() => {
    void (async () => {
      const L = (await import('leaflet')).default;
      if (!mapRef.current || mapInstanceRef.current) return;
      const map = L.map(mapRef.current, { zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
      mapInstanceRef.current = map;
    })();
    return () => { if (mapInstanceRef.current) { (mapInstanceRef.current as { remove(): void }).remove(); mapInstanceRef.current = null; } };
  }, []);

  useEffect(() => {
    void (async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current as ReturnType<typeof L.map> | null;
      if (!map) return;
      for (const layer of layersRef.current) (layer as { remove(): void }).remove();
      layersRef.current = [];
      const bounds: [number, number][] = [];

      // Determine which legs/stages to show based on focus
      const showLegs = focusedLeg !== null ? [focusedLeg] : legs.map((_, i) => i);


      // Stage polylines
      for (const stage of stageGeos) {
        if (stage.coords.length < 2 || hiddenStageIds.has(stage.id)) continue;
        // If focused on a leg, only show nearby stages
        const latlngs = stage.coords.map(([lng, lat]) => [lat, lng] as [number, number]);
        if (focusedLeg === null) bounds.push(...latlngs);
        const poly = L.polyline(latlngs, { color: stage.color, weight: 5, opacity: 0.45 }).bindTooltip(stage.name).addTo(map);
        layersRef.current.push(poly);
        const mid = latlngs[Math.floor(latlngs.length / 2)];
        const lbl = L.marker(mid, { icon: L.divIcon({ html: `<div style="background:rgba(255,255,255,0.9);border:1px solid ${stage.color};border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700;color:${stage.color};white-space:nowrap">${stage.name}</div>`, className: '', iconAnchor: [0, 0] }), interactive: false }).addTo(map);
        layersRef.current.push(lbl);
      }

      // Important stage points
      for (const p of importantPoints) {
        const [lng, lat] = p.coord;
        const cat = effectiveCategory(p);
        const meta = CATEGORY_META[cat];
        const icon = L.divIcon({ html: `<div style="background:${meta.color};color:${meta.textOnColor};border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;border:1.5px solid rgba(0,0,0,0.3)">${meta.glyph}</div>`, className: '', iconSize: [18, 18], iconAnchor: [9, 9] });
        layersRef.current.push(L.marker([lat, lng], { icon }).bindTooltip(`${meta.label}: ${p.name || '(unnamed)'}`).addTo(map));
      }

      // Route legs
      showLegs.forEach((legIdx) => {
        const leg = legs[legIdx];
        if (!leg) return;
        leg.options.forEach((opt, routeIdx) => {
          if (!(visibleRoutes.get(`${legIdx}-${routeIdx}`) ?? true) || !opt.route.geometry) return;
          const coords = opt.route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          bounds.push(...coords);
          layersRef.current.push(L.polyline(coords, { color: opt.color, weight: 3.5, opacity: 0.9, dashArray: routeIdx > 0 ? '8 5' : undefined }).bindTooltip(opt.label).addTo(map));
        });
      });

      // Stop markers
      const stopsToShow = focusedLeg !== null
        ? [stops[focusedLeg], stops[focusedLeg + 1]].filter(Boolean)
        : stops;
      stopsToShow.forEach((stop, idx) => {
        const globalIdx = focusedLeg !== null ? focusedLeg + idx : idx;
        const point = allPoints.find((p) => p.id === stop.pointId);
        if (!point) return;
        const [lng, lat] = point.coord;
        bounds.push([lat, lng]);
        const num = globalIdx === 0 ? '⌂' : String(globalIdx);
        const icon = L.divIcon({ html: `<div style="background:#1e293b;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${num}</div>`, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
        layersRef.current.push(L.marker([lat, lng], { icon }).bindTooltip(`${num}: ${pointLabel(point)}`).addTo(map));
      });

      if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [35, 35] });
    })();
  }, [legs, stops, allPoints, stageGeos, importantPoints, visibleRoutes, hiddenStageIds, focusedLeg]);

  return <div ref={mapRef} className="w-full rounded border border-slate-200 z-0" style={{ height: '520px' }} />;
}

// ── main component ────────────────────────────────────────────────────────────

export function DeploymentPlanner({ onClose }: { onClose: () => void }) {
  const state = useProject();
  const allPoints = state.points;

  // Visit sequence
  const [originId, setOriginId] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [waitTimes, setWaitTimes] = useState<Map<string, number>>(new Map()); // stopId → min, default 15

  // Schedule
  const [schedule, setSchedule] = useState<StageSchedule[]>(() =>
    state.stages.map((s) => ({ stageId: s.id, stageName: s.exportName, startTime: '10:00' })));
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [closure, setClosure] = useState<ClosureParams>(DEFAULT_CLOSURE);
  const [departureTime, setDepartureTime] = useState('08:00');

  // Routing
  const [routingProvider, setRoutingProvider] = useState<RoutingProvider>('osrm');
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem(GOOGLE_KEY_LS) ?? '');
  const [showSettings, setShowSettings] = useState(false);

  // Results
  const [legs, setLegs] = useState<RoutedLeg[]>([]);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [visibleRoutes, setVisibleRoutes] = useState<Map<string, boolean>>(new Map());
  const [selectedOptions, setSelectedOptions] = useState<Map<number, number>>(new Map()); // legIdx → routeIdx
  const [focusedLeg, setFocusedLeg] = useState<number | null>(null);
  const [hiddenStageIds, setHiddenStageIds] = useState<Set<string>>(new Set());

  const closureMinutes = effectiveClosureMinutes(closure);

  const getWait = (stopId: string) => waitTimes.get(stopId) ?? 15;
  const setWait = (stopId: string, min: number) => setWaitTimes((prev) => new Map(prev).set(stopId, min));

  const getSelectedOpt = (legIdx: number) => selectedOptions.get(legIdx) ?? 0;
  const selectOpt = (legIdx: number, routeIdx: number) =>
    setSelectedOptions((prev) => new Map(prev).set(legIdx, routeIdx));

  const isRouteVisible = (li: number, ri: number) => visibleRoutes.get(`${li}-${ri}`) ?? true;
  const toggleRoute = (li: number, ri: number) =>
    setVisibleRoutes((prev) => new Map(prev).set(`${li}-${ri}`, !isRouteVisible(li, ri)));

  // Stage geometries
  const stageGeos = useMemo((): StageGeo[] =>
    state.stages.map((s, i) => {
      const coords = getStageDerivedGeometry(state, s.id) ?? [];
      const track = state.tracks.find((t) => t.id === s.legs[0]?.trackId);
      return { id: s.id, name: s.exportName, coords, color: track?.styleColorHex ?? STAGE_COLOURS[i % STAGE_COLOURS.length] };
    }).filter((s) => s.coords.length >= 2), [state]);

  const importantPoints = useMemo((): ParsedPoint[] => {
    const seen = new Set<string>();
    return state.stages.flatMap((s) =>
      getStageAssignedPoints(state, s.id)
        .filter((p) => IMPORTANT_CATS.has(effectiveCategory(p)) && !seen.has(p.id))
        .map((p) => { seen.add(p.id); return p; }));
  }, [state]);

  // All waypoints (origin + stops) for routing
  const waypoints = useMemo((): { stop: Stop; point: ParsedPoint }[] => {
    const origin = allPoints.find((p) => p.id === originId);
    const result = origin ? [{ stop: { id: 'origin', pointId: originId }, point: origin }] : [];
    for (const s of stops) {
      const pt = allPoints.find((p) => p.id === s.pointId);
      if (pt) result.push({ stop: s, point: pt });
    }
    return result;
  }, [originId, stops, allPoints]);

  const mapStops = useMemo((): Stop[] => [
    ...(originId ? [{ id: 'origin', pointId: originId }] : []),
    ...stops,
  ], [originId, stops]);

  // ── Calculate routes ────────────────────────────────────────────────────────

  const calculateRoutes = async () => {
    if (waypoints.length < 2) return;
    setRouting(true);
    setRouteError(null);
    setVisibleRoutes(new Map());
    setSelectedOptions(new Map());
    setFocusedLeg(0);
    const newLegs: RoutedLeg[] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i], to = waypoints[i + 1];
      const candidates: { label: string; route: OsrmRoute }[] = [];
      try {
        const nearby = findNearbyStage(from.point.coord, to.point.coord, stageGeos);

        // 1. Direct + alternatives
        try {
          const res = await routeWaypoints([from.point.coord, to.point.coord], 3, routingProvider, googleApiKey || undefined);
          res.routes.forEach((r, idx) => candidates.push({ label: idx === 0 ? 'Direct' : `Alternative ${idx}`, route: r }));
        } catch { /* ignore */ }

        if (nearby) {
          // 2. Via stage
          try {
            const wpVia = viaStageWaypoints(from.point.coord, nearby, to.point.coord);
            const res = await routeWaypoints(wpVia, 0, routingProvider, googleApiKey || undefined);
            if (res.routes[0]) candidates.push({ label: `Via ${nearby.name}`, route: res.routes[0] });
          } catch { /* ignore */ }

          // 3. Avoid stage: try 2/4/6 km offsets in both perpendicular directions
          const midIdx = Math.floor(nearby.coords.length / 2);
          const midPt = nearby.coords[midIdx];
          const prevPt = nearby.coords[Math.max(0, midIdx - 1)];
          const stageBrg = turfBearing(turfPoint([prevPt[0], prevPt[1]]), turfPoint([midPt[0], midPt[1]]));
          for (const km of [2, 4, 6]) {
            for (const side of [90, -90]) {
              try {
                const off = turfDestination(turfPoint([midPt[0], midPt[1]]), km, (stageBrg + side + 360) % 360, { units: 'kilometers' });
                const offCoord: LngLatAlt = [off.geometry.coordinates[0], off.geometry.coordinates[1]];
                const res = await routeWaypoints([from.point.coord, offCoord, to.point.coord], 0, routingProvider, googleApiKey || undefined);
                if (res.routes[0]) candidates.push({ label: `Around ${nearby.name} (${km}km)`, route: res.routes[0] });
              } catch { /* ignore */ }
            }
          }
        }

        const unique = dedupeRoutes(candidates);
        const options: RouteOption[] = unique.map((c, idx) => ({ label: c.label, route: c.route, color: ROUTE_COLORS[idx % ROUTE_COLORS.length] }));
        newLegs.push({ from: pointLabel(from.point), to: pointLabel(to.point), options, viaStage: nearby?.name ?? null, error: null });
      } catch (e) {
        newLegs.push({ from: pointLabel(from.point), to: pointLabel(to.point), options: [], viaStage: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
    setLegs(newLegs);
    setRouting(false);
  };

  // ── Time schedule ───────────────────────────────────────────────────────────

  const schedule_ = useMemo((): ScheduleEntry[] => {
    if (waypoints.length === 0) return [];
    const [h, m] = departureTime.split(':').map(Number);
    let t = new Date(); t.setHours(h, m, 0, 0);

    const entries: ScheduleEntry[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (i === 0) {
        const waitMin = 0;
        const depart = new Date(t);
        entries.push({ stopIdx: i, label: pointLabel(wp.point), arrive: null, driveSeconds: 0, waitMinutes: waitMin, depart });
        t = depart;
      } else {
        const leg = legs[i - 1];
        const optIdx = getSelectedOpt(i - 1);
        const driveSec = leg?.options[optIdx]?.route.duration ?? 0;
        const arrive = new Date(t.getTime() + driveSec * 1000);
        const waitMin = getWait(wp.stop.id);
        const depart = new Date(arrive.getTime() + waitMin * 60_000);
        entries.push({ stopIdx: i, label: pointLabel(wp.point), arrive, driveSeconds: driveSec, waitMinutes: waitMin, depart });
        t = depart;
      }
    }
    return entries;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs, waypoints, selectedOptions, waitTimes, departureTime]);

  const totalDriveSec = legs.reduce((s, leg, i) => s + (leg.options[getSelectedOpt(i)]?.route.duration ?? 0), 0);
  const totalWaitSec = stops.reduce((s, stop) => s + getWait(stop.id) * 60, 0);

  // ── Stage road closures ─────────────────────────────────────────────────────
  const closedAt = useMemo(() => schedule.map((sch) => safeUntil(sch.startTime, closureMinutes, eventDate)), [schedule, closureMinutes, eventDate]);
  const earliest = closedAt.length > 0 ? closedAt.reduce((a, b) => (a < b ? a : b)) : null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const moveStop = (idx: number, dir: -1 | 1) => {
    const next = [...stops];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setStops(next);
  };

  const facilityFirst = allPoints.filter((p) => FACILITY_CATEGORIES.has(effectiveCategory(p)) && effectiveCategory(p) !== 'other');
  const others = allPoints.filter((p) => !FACILITY_CATEGORIES.has(effectiveCategory(p)) || effectiveCategory(p) === 'other');

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Deployment planner</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowSettings((v) => !v)}
            className={['text-xs px-2 py-1 rounded border', showSettings ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-50'].join(' ')}>
            ⚙ Settings
          </button>
          <button type="button" onClick={onClose}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
            ← Back to editor
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-3">
          <div className="max-w-5xl mx-auto flex flex-wrap items-end gap-4 text-xs">
            <div>
              <span className="font-medium text-slate-700 block mb-1">Routing provider</span>
              <div className="flex gap-1">
                {(['osrm', 'google'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setRoutingProvider(p)}
                    className={['px-3 py-1.5 rounded border', routingProvider === p ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-50'].join(' ')}>
                    {p === 'osrm' ? 'OSRM (free)' : 'Google Maps'}
                  </button>
                ))}
              </div>
            </div>
            {routingProvider === 'google' && (
              <label className="flex-1 min-w-[280px]">
                <span className="font-medium text-slate-700 block mb-1">
                  Google Routes API key{' '}
                  <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">(get key)</a>
                  {' — enable "Routes API" on the key'}
                </span>
                <input
                  type="password"
                  value={googleApiKey}
                  onChange={(e) => { setGoogleApiKey(e.target.value); localStorage.setItem(GOOGLE_KEY_LS, e.target.value); }}
                  placeholder="AIza…"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-slate-400 text-[10px]">Stored in browser localStorage only — never committed to git.</span>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* Setup grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Visit sequence */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Visit sequence</h3>
              <select value={originId} onChange={(e) => setOriginId(e.target.value)}
                className="w-full text-xs rounded border border-slate-300 px-2 py-1.5">
                <option value="">— origin —</option>
                {facilityFirst.map((p) => <option key={p.id} value={p.id}>{pointLabel(p)}</option>)}
                {others.map((p) => <option key={p.id} value={p.id}>{pointLabel(p)}</option>)}
              </select>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {stops.map((stop, idx) => {
                  const pt = allPoints.find((p) => p.id === stop.pointId);
                  return (
                    <div key={stop.id} className="flex items-center gap-1 text-xs rounded border border-slate-200 bg-white px-2 py-1">
                      <span className="text-slate-400 w-4 text-center shrink-0">{idx + 1}</span>
                      <span className="flex-1 truncate min-w-0">{pt ? pointLabel(pt) : '—'}</span>
                      {/* Wait time */}
                      <input type="number" min={0} max={180} value={getWait(stop.id)}
                        onChange={(e) => setWait(stop.id, parseInt(e.target.value) || 0)}
                        className="w-12 text-center rounded border border-slate-200 px-1 py-0.5 font-mono text-[11px]"
                        title="Wait time (min)" />
                      <span className="text-slate-400 text-[10px]">min</span>
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
                {allPoints.filter((p) => p.id !== originId).map((p) => <option key={p.id} value={p.id}>{pointLabel(p)}</option>)}
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

            {/* Closure + departure + calculate */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Closure window</h3>
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
                  <label key={key}>
                    <span className="text-slate-500 text-[10px]">{lbl} (min)</span>
                    <input type="number" min={0} value={closure[key]}
                      onChange={(e) => setClosure((c) => ({ ...c, [key]: parseInt(e.target.value) || 0 }))}
                      className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs" />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-700 shrink-0">Depart at</span>
                <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs" />
              </label>
              <button type="button" disabled={waypoints.length < 2 || routing}
                onClick={() => void calculateRoutes()}
                className="w-full text-xs px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                {routing ? `Calculating via ${routingProvider === 'google' ? 'Google Maps' : 'OSRM'}…` : `Calculate routes (${Math.max(0, waypoints.length - 1)} leg${waypoints.length !== 2 ? 's' : ''})`}
              </button>
            </div>
          </div>

          {routeError && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{routeError}</div>}

          {/* Map legend + focus selector */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {/* Leg focus dropdown */}
              {legs.length > 0 && (
                <select value={focusedLeg ?? ''} onChange={(e) => setFocusedLeg(e.target.value === '' ? null : Number(e.target.value))}
                  className="text-xs rounded border border-slate-300 px-2 py-1 bg-white">
                  <option value="">Show all legs</option>
                  {legs.map((leg, i) => <option key={i} value={i}>Leg {i + 1}: {leg.from.split(' (')[0]} → {leg.to.split(' (')[0]}</option>)}
                </select>
              )}
              <span className="text-slate-300">|</span>
              {stageGeos.map((s) => {
                const hidden = hiddenStageIds.has(s.id);
                return (
                  <button key={s.id} type="button"
                    onClick={() => setHiddenStageIds((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                    className={['flex items-center gap-1 px-1.5 py-0.5 rounded border transition-opacity', hidden ? 'opacity-40 border-slate-300' : 'border-transparent hover:bg-slate-100'].join(' ')}>
                    <span className="w-4 h-1 inline-block rounded" style={{ background: s.color }} />
                    <span style={{ color: s.color }} className="font-medium">{s.name}</span>
                  </button>
                );
              })}
            </div>
            <RouteMap legs={legs} stops={mapStops} allPoints={allPoints} stageGeos={stageGeos}
              importantPoints={importantPoints} visibleRoutes={visibleRoutes} hiddenStageIds={hiddenStageIds} focusedLeg={focusedLeg} />
          </div>

          {/* Itinerary + route selection */}
          {legs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Routes per leg</h3>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setVisibleRoutes(new Map())}
                    className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">Show all</button>
                  <button type="button"
                    onClick={() => { const m = new Map<string,boolean>(); legs.forEach((l, li) => l.options.forEach((_,ri) => m.set(`${li}-${ri}`, false))); setVisibleRoutes(m); }}
                    className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">Hide all</button>
                </div>
              </div>
              <ul className="space-y-2">
                {legs.map((leg, legIdx) => {
                  const selOpt = getSelectedOpt(legIdx);
                  return (
                    <li key={legIdx}
                      className={['rounded border px-3 py-2 text-xs', focusedLeg === legIdx ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'].join(' ')}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <button type="button" className="font-medium text-slate-700 text-left hover:text-blue-700"
                          onClick={() => setFocusedLeg(focusedLeg === legIdx ? null : legIdx)}>
                          Leg {legIdx + 1}: {leg.from} → {leg.to}
                          {leg.viaStage && <span className="ml-1 font-normal text-slate-400">(near {leg.viaStage})</span>}
                        </button>
                      </div>
                      {leg.error ? <p className="text-red-700">{leg.error}</p>
                        : leg.options.length === 0 ? <p className="text-slate-400 italic">No routes found.</p>
                        : (
                          <div className="space-y-1">
                            {leg.options.map((opt, routeIdx) => {
                              const visible = isRouteVisible(legIdx, routeIdx);
                              const isBest = selOpt === routeIdx;
                              return (
                                <div key={routeIdx}
                                  className={['flex items-center gap-2 rounded px-2 py-1 border', isBest ? 'border-2' : 'border', visible ? '' : 'opacity-50'].join(' ')}
                                  style={{ borderColor: isBest ? opt.color : '#e2e8f0', background: isBest ? opt.color + '15' : undefined }}>
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: opt.color }} />
                                  <span className="font-medium flex-1" style={{ color: opt.color }}>{opt.label}</span>
                                  <span className="text-slate-600">{formatDistance(opt.route.distance)} · {formatDuration(opt.route.duration)}</span>
                                  <button type="button" onClick={() => selectOpt(legIdx, routeIdx)}
                                    className={['text-[11px] px-2 py-0.5 rounded border shrink-0', isBest ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-50'].join(' ')}>
                                    {isBest ? '★ Best' : 'Select'}
                                  </button>
                                  <button type="button" onClick={() => toggleRoute(legIdx, routeIdx)}
                                    className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 hover:bg-slate-50 shrink-0">
                                    {visible ? 'Hide' : 'Show'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Time schedule */}
          {schedule_.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Time schedule</h3>
                <div className="text-xs text-slate-500">
                  Drive {formatDuration(totalDriveSec)} · Waiting {formatDuration(totalWaitSec)} · Total {formatDuration(totalDriveSec + totalWaitSec)}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-left">
                      <th className="px-3 py-2 font-medium">Stop</th>
                      <th className="px-3 py-2 font-medium">Drive</th>
                      <th className="px-3 py-2 font-medium">Arrive</th>
                      <th className="px-3 py-2 font-medium">Wait (min)</th>
                      <th className="px-3 py-2 font-medium">Depart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule_.map((entry, i) => {
                      const stopId = waypoints[i]?.stop.id;
                      // Check if stage closes during this leg
                      const legCloseWarning = earliest && entry.arrive && entry.arrive > earliest;
                      return (
                        <tr key={i} className={['border-t border-slate-100', legCloseWarning ? 'bg-red-50' : i % 2 === 0 ? '' : 'bg-slate-50'].join(' ')}>
                          <td className="px-3 py-2 font-medium">{i === 0 ? '⌂ ' : `${i}. `}{entry.label}</td>
                          <td className="px-3 py-2 text-slate-500">
                            {entry.driveSeconds > 0 ? formatDuration(entry.driveSeconds) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {entry.arrive ? (
                              <span className={legCloseWarning ? 'text-red-700 font-semibold' : ''}>
                                {formatTime(entry.arrive)}
                                {legCloseWarning && ' ⚠'}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {i === 0 ? '—' : (
                              <input type="number" min={0} max={180} value={getWait(stopId ?? '')}
                                onChange={(e) => setWait(stopId ?? '', parseInt(e.target.value) || 0)}
                                className="w-14 text-center rounded border border-slate-300 px-1 py-0.5 font-mono" />
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium">{formatTime(entry.depart)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {earliest && (
                  <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                    Stage road closes at <span className="font-medium">{formatTime(earliest)}</span> ({closure.role === 'public' ? 'general public' : closure.role === 'org' ? 'organising team' : 'safety delegate'} window)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
