import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bearing as turfBearing,
  destination as turfDestination,
  distance as turfDistance,
  lineString,
  point as turfPoint,
  pointToLineDistance,
} from '@turf/turf';
import { nanoid } from 'nanoid';
import saveAs from 'file-saver';
import type { LngLatAlt, ParsedPoint } from '../types';
import { CATEGORY_META } from '../classify/categoryMeta';
import {
  effectiveCategory,
  getStageDerivedGeometry,
  getStageAssignedPoints,
} from '../state/selectors';
import { useProject, useProjectDispatch } from '../state/useProject';
import { formatDistance, formatDuration } from '../lib/osrm';
import { GOOGLE_KEY_LS, routeWaypoints } from '../lib/routing';
import type { OsrmRoute } from '../lib/osrm';
import { deploymentKml } from '../export/deploymentKml';
import { deploymentGpx } from '../export/deploymentGpx';
import { elevSvg } from '../export/deploymentPdf';

// ── types ─────────────────────────────────────────────────────────────────────

interface Stop { id: string; pointId: string }
interface StageSchedule { stageId: string; stageName: string; startTime: string }
interface ClosureParams { publicMinutes: number; orgMinutes: number; safetyMinutes: number; role: 'public' | 'org' | 'safety' }
interface RouteOption { label: string; source: 'osrm' | 'google'; route: OsrmRoute; color: string; dashArray?: string }
interface RoutedLeg { from: string; to: string; options: RouteOption[]; viaStage: string | null; error: string | null }
interface StageGeo { id: string; name: string; coords: LngLatAlt[]; color: string }

interface ScheduleEntry {
  stopIdx: number;
  label: string;
  arrive: Date | null;
  driveSeconds: number;
  waitMinutes: number;
  depart: Date;
}

// ── constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CLOSURE: ClosureParams = { publicMinutes: 120, orgMinutes: 60, safetyMinutes: 30, role: 'org' };
const IMPORTANT_CATS = new Set(['start', 'finish', 'stop', 'atc']);
const STAGE_COLOURS = ['#e11d48','#d97706','#16a34a','#2563eb','#7c3aed','#0891b2','#ea580c','#84cc16'];

// Each route option gets a distinct color + dash style regardless of source.
const ROUTE_STYLES: { color: string; dashArray?: string }[] = [
  { color: '#2563eb' },
  { color: '#dc2626', dashArray: '10 5' },
  { color: '#16a34a', dashArray: '4 4' },
  { color: '#d97706', dashArray: '14 4 4 4' },
  { color: '#7c3aed' },
  { color: '#0891b2', dashArray: '10 5' },
  { color: '#ea580c', dashArray: '4 4' },
  { color: '#be185d', dashArray: '14 4 4 4' },
];

const POINT_GROUPS: { label: string; cats: Set<string> }[] = [
  { label: 'Facilities', cats: new Set(['service_park', 'hq', 'parc_ferme']) },
  { label: 'Stop controls', cats: new Set(['stop', 'atc']) },
  { label: 'Stage timing', cats: new Set(['start', 'finish', 'pc', 'intermediate']) },
  { label: 'Marshal / safety', cats: new Set(['marshall', 'radio', 'ambulance', 'refuel', 'scrutineering', 'chicane']) },
  { label: 'Other', cats: new Set(['other']) },
];
const ALL_GROUPED_CATS = new Set(POINT_GROUPS.flatMap((g) => [...g.cats]));

const newStop = (pointId: string): Stop => ({ id: nanoid(), pointId });

// ── helpers ───────────────────────────────────────────────────────────────────

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

function dedupeRoutes(routes: { label: string; source: 'osrm' | 'google'; route: OsrmRoute }[]) {
  const bySource = new Map<'osrm' | 'google', typeof routes>();
  for (const r of routes) {
    const list = bySource.get(r.source) ?? [];
    if (!list.some((o) => Math.abs(o.route.distance - r.route.distance) / Math.max(o.route.distance, 1) < 0.03))
      list.push(r);
    bySource.set(r.source, list);
  }
  return [...(bySource.get('osrm') ?? []), ...(bySource.get('google') ?? [])];
}

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

// ── elevation helpers ─────────────────────────────────────────────────────────

function sampleArr<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  return Array.from({ length: n }, (_, i) => arr[Math.round((i / (n - 1)) * (arr.length - 1))]);
}

async function fetchElevation(coords: [number, number][]): Promise<number[] | null> {
  if (coords.length === 0) return null;
  const locations = coords.map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join('|');
  try {
    const res = await fetch(`https://api.opentopodata.org/v1/srtm90m?locations=${locations}`);
    if (!res.ok) return null;
    const json = await res.json() as { results: { elevation: number }[] };
    return json.results.map((r) => r.elevation);
  } catch {
    return null;
  }
}

function toElevPoints(coords: [number, number][], elevs: number[]): [number, number][] {
  const pts: [number, number][] = [];
  let distKm = 0;
  for (let i = 0; i < Math.min(coords.length, elevs.length); i++) {
    if (i > 0) distKm += turfDistance(turfPoint(coords[i - 1]), turfPoint(coords[i]), { units: 'kilometers' });
    pts.push([distKm, elevs[i]]);
  }
  return pts;
}

function extractElevation(coords: LngLatAlt[]): [number, number][] | null {
  const withZ = coords.filter((c) => c[2] !== undefined && !isNaN(c[2] as number));
  if (withZ.length < 2 || withZ.length < coords.length * 0.5) return null;
  let distKm = 0;
  return coords.map((c, i) => {
    if (i > 0) distKm += turfDistance(turfPoint([coords[i - 1][0], coords[i - 1][1]]), turfPoint([c[0], c[1]]), { units: 'kilometers' });
    return [distKm, c[2] ?? 0] as [number, number];
  });
}

// ── grouped point selector ────────────────────────────────────────────────────

function GroupedOptions({ points, exclude }: { points: ParsedPoint[]; exclude?: string }) {
  const filtered = exclude ? points.filter((p) => p.id !== exclude) : points;
  return (
    <>
      {POINT_GROUPS.map((group) => {
        const pts = filtered.filter((p) => group.cats.has(effectiveCategory(p)));
        if (pts.length === 0) return null;
        return (
          <optgroup key={group.label} label={group.label}>
            {pts.map((p) => (
              <option key={p.id} value={p.id}>{pointLabel(p)}</option>
            ))}
          </optgroup>
        );
      })}
      {(() => {
        const rest = filtered.filter((p) => !ALL_GROUPED_CATS.has(effectiveCategory(p)));
        if (rest.length === 0) return null;
        return (
          <optgroup label="Other">
            {rest.map((p) => <option key={p.id} value={p.id}>{pointLabel(p)}</option>)}
          </optgroup>
        );
      })()}
    </>
  );
}

// ── export helpers ────────────────────────────────────────────────────────────

function buildGoogleMapsUrl(waypoints: { stop: Stop; point: ParsedPoint }[]): string {
  if (waypoints.length < 2) return '';
  const fmt = (p: ParsedPoint) => `${p.coord[1].toFixed(6)},${p.coord[0].toFixed(6)}`;
  const params = new URLSearchParams({
    api: '1',
    origin: fmt(waypoints[0].point),
    destination: fmt(waypoints[waypoints.length - 1].point),
  });
  const intermediates = waypoints.slice(1, -1).slice(0, 9);
  if (intermediates.length > 0) params.set('waypoints', intermediates.map((w) => fmt(w.point)).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}


// ── RouteSwatch ───────────────────────────────────────────────────────────────

function RouteSwatch({ color, dashArray, w = 28 }: { color: string; dashArray?: string; w?: number }) {
  return (
    <svg width={w} height="10" className="shrink-0 inline-block align-middle">
      <line x1="2" y1="5" x2={w - 2} y2="5"
        stroke={color} strokeWidth="2.5"
        strokeDasharray={dashArray ?? 'none'}
        strokeLinecap="round" />
    </svg>
  );
}

// ── RouteMap ──────────────────────────────────────────────────────────────────

interface RouteMapProps {
  legs: RoutedLeg[];
  stops: Stop[];
  allPoints: ParsedPoint[];
  stageGeos: StageGeo[];
  importantPoints: ParsedPoint[];
  visibleRoutes: Map<string, boolean>;
  hiddenStageIds: Set<string>;
  focusedLeg: number | null;
  selectedOptions: Map<number, number>;
}

function RouteMap({ legs, stops, allPoints, stageGeos, importantPoints, visibleRoutes, hiddenStageIds, focusedLeg, selectedOptions }: RouteMapProps) {
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
        crossOrigin: 'anonymous',
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

      // Stage polylines
      for (const stage of stageGeos) {
        if (stage.coords.length < 2 || hiddenStageIds.has(stage.id)) continue;
        const latlngs = stage.coords.map(([lng, lat]) => [lat, lng] as [number, number]);
        const poly = L.polyline(latlngs, { color: stage.color, weight: 5, opacity: 0.45 }).bindTooltip(stage.name).addTo(map);
        layersRef.current.push(poly);
        const mid = latlngs[Math.floor(latlngs.length / 2)];
        const lbl = L.marker(mid, {
          icon: L.divIcon({
            html: `<div style="background:rgba(255,255,255,0.9);border:1px solid ${stage.color};border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700;color:${stage.color};white-space:nowrap">${stage.name}</div>`,
            className: '', iconAnchor: [0, 0],
          }),
          interactive: false,
        }).addTo(map);
        layersRef.current.push(lbl);
      }

      // Important control points
      for (const pt of importantPoints) {
        const [lng, lat] = pt.coord;
        const cat = effectiveCategory(pt);
        const meta = CATEGORY_META[cat];
        const icon = L.divIcon({
          html: `<div style="background:${meta.color};color:${meta.textOnColor};border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;border:1.5px solid rgba(0,0,0,0.3)">${meta.glyph}</div>`,
          className: '', iconSize: [18, 18], iconAnchor: [9, 9],
        });
        layersRef.current.push(L.marker([lat, lng], { icon }).bindTooltip(`${meta.label}: ${pt.name || '(unnamed)'}`).addTo(map));
      }

      // Route legs: focused leg at full weight, others show only selected route at low opacity
      legs.forEach((leg, legIdx) => {
        const isFocused = focusedLeg === null || focusedLeg === legIdx;
        const selOpt = selectedOptions.get(legIdx) ?? 0;
        leg.options.forEach((opt, routeIdx) => {
          const isSelected = selOpt === routeIdx;
          if (isFocused) {
            if (!(visibleRoutes.get(`${legIdx}-${routeIdx}`) ?? true) || !opt.route.geometry) return;
          } else {
            if (!isSelected || !opt.route.geometry) return;
          }
          const coords = opt.route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          if (isFocused) bounds.push(...coords);
          layersRef.current.push(
            L.polyline(coords, {
              color: opt.color,
              weight: isFocused ? 4 : 2.5,
              opacity: isFocused ? 0.9 : 0.35,
              dashArray: opt.dashArray,
            })
              .bindTooltip(isFocused ? opt.label : `Leg ${legIdx + 1}: ${leg.from.split(' (')[0]} → ${leg.to.split(' (')[0]}`)
              .addTo(map),
          );
        });
      });

      // Stop markers — show focused pair when focused, all when not
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
        const icon = L.divIcon({
          html: `<div style="background:#1e293b;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${num}</div>`,
          className: '', iconSize: [22, 22], iconAnchor: [11, 11],
        });
        layersRef.current.push(L.marker([lat, lng], { icon }).bindTooltip(`${num}: ${pointLabel(point)}`).addTo(map));
      });

      if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [35, 35] });
    })();
  }, [legs, stops, allPoints, stageGeos, importantPoints, visibleRoutes, hiddenStageIds, focusedLeg, selectedOptions]);

  return <div ref={mapRef} className="w-full rounded border border-slate-200 z-0" style={{ height: '620px' }} />;
}

// ── main component ────────────────────────────────────────────────────────────

export function DeploymentPlanner({ onClose }: { onClose: () => void }) {
  const state = useProject();
  const dispatch = useProjectDispatch();
  const allPoints = state.points;
  const saved = state.deploymentPlan;

  const validPointIds = useMemo(() => new Set(allPoints.map((p) => p.id)), [allPoints]);

  // ── persistent state (loaded from project, saved back on demand) ─────────────
  const [originId, setOriginId] = useState(saved?.originId ?? '');
  const [stops, setStops] = useState<Stop[]>(() =>
    (saved?.stops ?? []).filter((s) => validPointIds.has(s.pointId)));
  const [waitTimes, setWaitTimes] = useState<Map<string, number>>(
    () => new Map(Object.entries(saved?.waitTimes ?? {})));
  const [schedule, setSchedule] = useState<StageSchedule[]>(() => {
    const savedMap = new Map((saved?.stageSchedule ?? []).map((s) => [s.stageId, s]));
    return state.stages.map((s) => savedMap.get(s.id) ?? { stageId: s.id, stageName: s.exportName, startTime: '10:00' });
  });
  const [eventDate, setEventDate] = useState(saved?.eventDate ?? new Date().toISOString().slice(0, 10));
  const [closure, setClosure] = useState<ClosureParams>(saved?.closure ?? DEFAULT_CLOSURE);
  const [departureTime, setDepartureTime] = useState(saved?.departureTime ?? '08:00');
  const [selectedOptions, setSelectedOptions] = useState<Map<number, number>>(
    () => new Map(Object.entries(saved?.selectedOptions ?? {}).map(([k, v]) => [Number(k), v])));

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem(GOOGLE_KEY_LS) ?? '');
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [planRestored, setPlanRestored] = useState(false);
  const [copied, setCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Explicit restore on mount — belt-and-suspenders over the useState initializers.
  // Handles the case where the component was previously mounted before the plan was saved.
  useEffect(() => {
    const plan = state.deploymentPlan;
    if (!plan) return;
    const validIds = new Set(state.points.map((p) => p.id));
    setOriginId(plan.originId);
    setStops(plan.stops.filter((s) => validIds.has(s.pointId)));
    setWaitTimes(new Map(Object.entries(plan.waitTimes)));
    setEventDate(plan.eventDate);
    setClosure(plan.closure);
    setDepartureTime(plan.departureTime);
    const savedMap = new Map(plan.stageSchedule.map((s) => [s.stageId, s]));
    setSchedule(state.stages.map((s) => savedMap.get(s.id) ?? { stageId: s.id, stageName: s.exportName, startTime: '10:00' }));
    setSelectedOptions(new Map(Object.entries(plan.selectedOptions ?? {}).map(([k, v]) => [Number(k), v])));
    setPlanRestored(true);
  // Intentionally runs only on mount — we don't want to clobber user edits on re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [legs, setLegs] = useState<RoutedLeg[]>([]);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [visibleRoutes, setVisibleRoutes] = useState<Map<string, boolean>>(new Map());
  const [focusedLeg, setFocusedLeg] = useState<number | null>(null);
  const [hiddenStageIds, setHiddenStageIds] = useState<Set<string>>(new Set());

  const hasGoogle = googleApiKey.trim().length > 10;
  const closureMinutes = effectiveClosureMinutes(closure);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExport]);

  const getWait = (stopId: string) => waitTimes.get(stopId) ?? 15;
  const setWait = (stopId: string, min: number) => setWaitTimes((prev) => new Map(prev).set(stopId, min));

  const getSelectedOpt = (legIdx: number) => selectedOptions.get(legIdx) ?? 0;
  const selectOpt = (legIdx: number, routeIdx: number) =>
    setSelectedOptions((prev) => new Map(prev).set(legIdx, routeIdx));

  const isRouteVisible = (li: number, ri: number) => visibleRoutes.get(`${li}-${ri}`) ?? true;
  const toggleRoute = (li: number, ri: number) =>
    setVisibleRoutes((prev) => new Map(prev).set(`${li}-${ri}`, !isRouteVisible(li, ri)));

  // ── derived geometry ─────────────────────────────────────────────────────────

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

  // ── route calculation ────────────────────────────────────────────────────────

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
      const candidates: { label: string; source: 'osrm' | 'google'; route: OsrmRoute }[] = [];
      try {
        const nearby = findNearbyStage(from.point.coord, to.point.coord, stageGeos);

        try {
          const res = await routeWaypoints([from.point.coord, to.point.coord], 3, 'osrm');
          res.routes.forEach((r, idx) => candidates.push({ label: idx === 0 ? 'Direct' : `Alternative ${idx}`, source: 'osrm', route: r }));
        } catch { /* ignore */ }

        if (nearby) {
          try {
            const wpVia = viaStageWaypoints(from.point.coord, nearby, to.point.coord);
            const res = await routeWaypoints(wpVia, 0, 'osrm');
            if (res.routes[0]) candidates.push({ label: `Via ${nearby.name}`, source: 'osrm', route: res.routes[0] });
          } catch { /* ignore */ }

          const midIdx = Math.floor(nearby.coords.length / 2);
          const midPt = nearby.coords[midIdx];
          const prevPt = nearby.coords[Math.max(0, midIdx - 1)];
          const stageBrg = turfBearing(turfPoint([prevPt[0], prevPt[1]]), turfPoint([midPt[0], midPt[1]]));
          for (const km of [2, 4, 6]) {
            for (const side of [90, -90]) {
              try {
                const off = turfDestination(turfPoint([midPt[0], midPt[1]]), km, (stageBrg + side + 360) % 360, { units: 'kilometers' });
                const offCoord: LngLatAlt = [off.geometry.coordinates[0], off.geometry.coordinates[1]];
                const res = await routeWaypoints([from.point.coord, offCoord, to.point.coord], 0, 'osrm');
                if (res.routes[0]) candidates.push({ label: `Around ${nearby.name} (${km}km)`, source: 'osrm', route: res.routes[0] });
              } catch { /* ignore */ }
            }
          }
        }

        if (hasGoogle) {
          try {
            const res = await routeWaypoints([from.point.coord, to.point.coord], true, 'google', googleApiKey);
            res.routes.forEach((r, idx) => candidates.push({ label: idx === 0 ? 'Direct' : `Alternative ${idx}`, source: 'google', route: r }));
          } catch { /* ignore */ }
          if (nearby) {
            try {
              const wpVia = viaStageWaypoints(from.point.coord, nearby, to.point.coord);
              const res = await routeWaypoints(wpVia, false, 'google', googleApiKey);
              if (res.routes[0]) candidates.push({ label: `Via ${nearby.name}`, source: 'google', route: res.routes[0] });
            } catch { /* ignore */ }
          }
        }

        const unique = dedupeRoutes(candidates);
        const options: RouteOption[] = unique.map((c, idx) => ({
          label: c.label, source: c.source, route: c.route,
          color: ROUTE_STYLES[idx % ROUTE_STYLES.length].color,
          dashArray: ROUTE_STYLES[idx % ROUTE_STYLES.length].dashArray,
        }));
        newLegs.push({ from: pointLabel(from.point), to: pointLabel(to.point), options, viaStage: nearby?.name ?? null, error: null });
      } catch (e) {
        newLegs.push({ from: pointLabel(from.point), to: pointLabel(to.point), options: [], viaStage: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
    setLegs(newLegs);
    setRouting(false);
  };

  // ── time schedule ────────────────────────────────────────────────────────────

  const schedule_ = useMemo((): ScheduleEntry[] => {
    if (waypoints.length === 0) return [];
    const [h, m] = departureTime.split(':').map(Number);
    let t = new Date(); t.setHours(h, m, 0, 0);
    const entries: ScheduleEntry[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (i === 0) {
        const depart = new Date(t);
        entries.push({ stopIdx: i, label: pointLabel(wp.point), arrive: null, driveSeconds: 0, waitMinutes: 0, depart });
      } else {
        const leg = legs[i - 1];
        const driveSec = leg?.options[getSelectedOpt(i - 1)]?.route.duration ?? 0;
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

  const closedAt = useMemo(() => schedule.map((sch) => safeUntil(sch.startTime, closureMinutes, eventDate)), [schedule, closureMinutes, eventDate]);
  const earliest = closedAt.length > 0 ? closedAt.reduce((a, b) => (a < b ? a : b)) : null;

  // ── save / export ────────────────────────────────────────────────────────────

  const savePlan = () => {
    dispatch({
      type: 'SET_DEPLOYMENT_PLAN',
      plan: {
        originId, stops, eventDate, closure, departureTime,
        waitTimes: Object.fromEntries(waitTimes),
        stageSchedule: schedule,
        selectedOptions: Object.fromEntries([...selectedOptions.entries()].map(([k, v]) => [String(k), v])),
      },
    });
    setPlanSaved(true);
    setTimeout(() => setPlanSaved(false), 2500);
  };

  const googleMapsUrl = waypoints.length >= 2 ? buildGoogleMapsUrl(waypoints) : '';

  const openGoogleMaps = () => { if (googleMapsUrl) window.open(googleMapsUrl, '_blank'); };

  const copyGoogleMapsUrl = async () => {
    if (!googleMapsUrl) return;
    await navigator.clipboard.writeText(googleMapsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadKml = () => {
    const kmlStops = waypoints.map(({ point }, idx) => ({
      idx, label: pointLabel(point).split(' (')[0],
      lng: point.coord[0], lat: point.coord[1],
    }));
    const kmlLegs = legs.map((leg, i) => ({
      fromLabel: leg.from.split(' (')[0],
      toLabel: leg.to.split(' (')[0],
      coords: (leg.options[getSelectedOpt(i)]?.route.geometry?.coordinates ?? []) as [number, number][],
      color: leg.options[getSelectedOpt(i)]?.color ?? '#2563eb',
    }));
    const blob = new Blob([deploymentKml(state.eventName, kmlStops, kmlLegs)], { type: 'application/vnd.google-earth.kml+xml' });
    saveAs(blob, `${state.eventName || 'deployment'}-plan.kml`);
  };

  const downloadGpx = () => {
    const gpxStops = waypoints.map(({ point }) => ({
      label: pointLabel(point).split(' (')[0],
      lng: point.coord[0], lat: point.coord[1],
    }));
    const gpxLegs = legs.map((leg, i) => ({
      coords: (leg.options[getSelectedOpt(i)]?.route.geometry?.coordinates ?? []) as [number, number][],
    }));
    const blob = new Blob([deploymentGpx(state.eventName, gpxStops, gpxLegs)], { type: 'application/gpx+xml' });
    saveAs(blob, `${state.eventName || 'deployment'}-plan.gpx`);
  };


  // ── helpers ──────────────────────────────────────────────────────────────────

  const moveStop = (idx: number, dir: -1 | 1) => {
    const next = [...stops];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setStops(next);
  };

  const legIdx = focusedLeg ?? 0;
  const currentLeg = legs[legIdx] ?? null;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-slate-50">

      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Deployment planner</h2>
        <div className="flex items-center gap-2">
          {/* Export dropdown */}
          <div ref={exportRef} className="relative">
            <button type="button" onClick={() => setShowExport((v) => !v)}
              disabled={waypoints.length < 2}
              className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Export ▾
            </button>
            {showExport && waypoints.length >= 2 && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded shadow-lg z-50 py-1">
                {waypoints.length > 11 && (
                  <div className="px-3 py-1.5 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100">
                    ⚠ {waypoints.length} stops — Google Maps URL limited to 11
                  </div>
                )}
                <button type="button" onClick={() => { openGoogleMaps(); setShowExport(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">
                  Open in Google Maps ↗
                </button>
                <button type="button" onClick={() => { void copyGoogleMapsUrl(); setShowExport(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">
                  {copied ? '✓ Copied!' : 'Copy Google Maps link'}
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button type="button" onClick={() => { downloadKml(); setShowExport(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">
                  Download KML (Google Earth / Maps)
                </button>
                <button type="button" onClick={() => { downloadGpx(); setShowExport(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">
                  Download GPX (OsmAnd / Garmin)
                </button>
              </div>
            )}
          </div>

          <button type="button" onClick={savePlan}
            className={['text-xs px-2 py-1 rounded border', planSaved ? 'bg-green-600 text-white border-green-600' : 'border-slate-300 hover:bg-slate-50'].join(' ')}>
            {planSaved ? '✓ Saved' : 'Save plan'}
          </button>
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

      {/* ── Settings panel ── */}
      {showSettings && (
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-3">
          <div className="max-w-5xl mx-auto flex flex-wrap items-end gap-4 text-xs">
            <label className="flex-1 min-w-[280px]">
              <span className="font-medium text-slate-700 block mb-1">
                Google Routes API key (optional){' '}
                <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">(get key)</a>
                {' — enable "Routes API"'}
              </span>
              <input type="password" value={googleApiKey}
                onChange={(e) => { setGoogleApiKey(e.target.value); localStorage.setItem(GOOGLE_KEY_LS, e.target.value); }}
                placeholder="AIza… (leave blank to use OSRM only)"
                className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <span className="text-slate-400 text-[10px]">
                {hasGoogle ? '✓ Google routes will be added alongside OSRM.' : 'OSRM (free) is always used. Add a Google key to also get Google routes.'}
                {' Stored in localStorage only.'}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* ── Setup grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Visit sequence */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Visit sequence</h3>
              <select value={originId} onChange={(e) => setOriginId(e.target.value)}
                className="w-full text-xs rounded border border-slate-300 px-2 py-1.5">
                <option value="">— origin —</option>
                <GroupedOptions points={allPoints} />
              </select>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {stops.map((stop, idx) => {
                  const pt = allPoints.find((p) => p.id === stop.pointId);
                  return (
                    <div key={stop.id} className="flex items-center gap-1 text-xs rounded border border-slate-200 bg-white px-2 py-1">
                      <span className="text-slate-400 w-4 text-center shrink-0">{idx + 1}</span>
                      <span className="flex-1 truncate min-w-0">{pt ? pointLabel(pt) : '—'}</span>
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
                <GroupedOptions points={allPoints} exclude={originId} />
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
                {routing ? `Calculating${hasGoogle ? ' (OSRM + Google)' : ' (OSRM)'}…` : `Calculate routes (${Math.max(0, waypoints.length - 1)} leg${waypoints.length !== 2 ? 's' : ''})`}
              </button>
            </div>
          </div>

          {routeError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{routeError}</div>
          )}


          {planRestored && legs.length === 0 && waypoints.length >= 2 && (
            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-center justify-between">
              <span>Plan restored. Hit <strong>Calculate routes</strong> to recompute driving times.</span>
              <button type="button" onClick={() => setPlanRestored(false)} className="text-blue-400 hover:text-blue-700 ml-3">✕</button>
            </div>
          )}

          {/* ── Stage visibility chips ── */}
          {stageGeos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-500 font-medium">Stages:</span>
              {stageGeos.map((s) => {
                const hidden = hiddenStageIds.has(s.id);
                return (
                  <button key={s.id} type="button"
                    onClick={() => setHiddenStageIds((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                    className={['flex items-center gap-1 px-1.5 py-0.5 rounded border transition-opacity', hidden ? 'opacity-35 border-slate-300' : 'border-transparent hover:bg-slate-100'].join(' ')}>
                    <span className="w-4 h-1 inline-block rounded" style={{ background: s.color }} />
                    <span style={{ color: s.color }} className="font-medium">{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Leg bar: selector + route toggle chips ── */}
          {legs.length > 0 && (
            <div className="rounded border border-slate-200 bg-white px-3 py-2.5 space-y-2">
              {/* Leg selector row */}
              <div className="flex items-center gap-2 text-xs">
                <button type="button"
                  onClick={() => setFocusedLeg(Math.max(0, (focusedLeg ?? 0) - 1))}
                  disabled={(focusedLeg ?? 0) === 0}
                  className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-30">
                  ‹
                </button>
                <select value={focusedLeg ?? 0} onChange={(e) => setFocusedLeg(Number(e.target.value))}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 bg-white text-xs">
                  {legs.map((leg, i) => (
                    <option key={i} value={i}>
                      Leg {i + 1}: {leg.from.split(' (')[0]} → {leg.to.split(' (')[0]}
                    </option>
                  ))}
                </select>
                <button type="button"
                  onClick={() => setFocusedLeg(Math.min(legs.length - 1, (focusedLeg ?? 0) + 1))}
                  disabled={(focusedLeg ?? 0) >= legs.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-30">
                  ›
                </button>
                {currentLeg && (() => {
                  const selOpt = currentLeg.options[getSelectedOpt(legIdx)];
                  return selOpt ? (
                    <span className="text-slate-500 shrink-0">
                      <span className="font-mono">{formatDistance(selOpt.route.distance)}</span>
                      {' · '}
                      <span className="font-mono">{formatDuration(selOpt.route.duration)}</span>
                      {currentLeg.viaStage && <span className="text-slate-400"> · near {currentLeg.viaStage}</span>}
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Route toggle chips */}
              {currentLeg && currentLeg.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {currentLeg.options.map((opt, ri) => {
                    const visible = isRouteVisible(legIdx, ri);
                    const selected = getSelectedOpt(legIdx) === ri;
                    return (
                      <button key={ri} type="button"
                        onClick={() => toggleRoute(legIdx, ri)}
                        title={`Click to ${visible ? 'hide' : 'show'} on map`}
                        className={[
                          'flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium transition-opacity',
                          visible ? 'opacity-100' : 'opacity-35',
                          selected ? 'ring-2 ring-offset-1 ring-slate-400' : '',
                        ].join(' ')}
                        style={{ borderColor: opt.color, color: opt.color }}>
                        <RouteSwatch color={opt.color} dashArray={opt.dashArray} w={24} />
                        <span>{opt.label}</span>
                        <span className={[
                          'text-[10px] px-1 rounded font-bold ml-0.5',
                          opt.source === 'google' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600',
                        ].join(' ')}>
                          {opt.source === 'google' ? 'G' : 'OSM'}
                        </span>
                        {selected && <span className="text-[10px]">★</span>}
                      </button>
                    );
                  })}
                  <div className="flex gap-1 ml-auto">
                    <button type="button" onClick={() => setVisibleRoutes(new Map())}
                      className="text-[11px] px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">All on</button>
                    <button type="button"
                      onClick={() => {
                        const m = new Map<string, boolean>();
                        currentLeg.options.forEach((_, ri) => m.set(`${legIdx}-${ri}`, false));
                        setVisibleRoutes((prev) => new Map([...prev, ...m]));
                      }}
                      className="text-[11px] px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50">All off</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Map ── */}
          <RouteMap legs={legs} stops={mapStops} allPoints={allPoints} stageGeos={stageGeos}
            importantPoints={importantPoints} visibleRoutes={visibleRoutes} hiddenStageIds={hiddenStageIds}
            focusedLeg={focusedLeg} selectedOptions={selectedOptions} />

          {/* ── Route comparison table ── */}
          {legs.length > 0 && currentLeg && (
            <div className="rounded border border-slate-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Route options — Leg {legIdx + 1}: {currentLeg.from.split(' (')[0]} → {currentLeg.to.split(' (')[0]}
                </span>
                {currentLeg.viaStage && (
                  <span className="text-xs text-slate-500">near stage: {currentLeg.viaStage}</span>
                )}
              </div>
              {currentLeg.error ? (
                <div className="px-3 py-2 text-xs text-red-700">{currentLeg.error}</div>
              ) : currentLeg.options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400 italic">No routes found for this leg.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-left">
                      <th className="px-3 py-2 font-medium">Route</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Distance</th>
                      <th className="px-3 py-2 font-medium">Duration</th>
                      <th className="px-3 py-2 font-medium" colSpan={2}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLeg.options.map((opt, ri) => {
                      const isSelected = getSelectedOpt(legIdx) === ri;
                      const isVisible = isRouteVisible(legIdx, ri);
                      return (
                        <tr key={ri}
                          className={['border-t border-slate-100', isSelected ? 'bg-slate-50' : ''].join(' ')}
                          style={{ borderLeft: `4px solid ${isSelected ? opt.color : 'transparent'}` }}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <RouteSwatch color={opt.color} dashArray={opt.dashArray} />
                              <span className="font-medium" style={{ color: opt.color }}>{opt.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className={[
                              'text-[11px] px-1.5 py-0.5 rounded font-semibold',
                              opt.source === 'google' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700',
                            ].join(' ')}>
                              {opt.source === 'google' ? 'Google' : 'OSRM'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono">{formatDistance(opt.route.distance)}</td>
                          <td className="px-3 py-2 font-mono">{formatDuration(opt.route.duration)}</td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => selectOpt(legIdx, ri)}
                              className={[
                                'text-[11px] px-2 py-0.5 rounded border',
                                isSelected ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-50',
                              ].join(' ')}>
                              {isSelected ? '★ Selected' : 'Select'}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => toggleRoute(legIdx, ri)}
                              className={['text-[11px] px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50', isVisible ? '' : 'opacity-50'].join(' ')}>
                              {isVisible ? 'Hide' : 'Show'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Time schedule ── */}
          {schedule_.length > 0 && legs.length > 0 && (
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
                      const legCloseWarn = !!(earliest && entry.arrive && entry.arrive > earliest);
                      return (
                        <tr key={i} className={['border-t border-slate-100', legCloseWarn ? 'bg-red-50' : i % 2 === 0 ? '' : 'bg-slate-50'].join(' ')}>
                          <td className="px-3 py-2 font-medium">{i === 0 ? '⌂ ' : `${i}. `}{entry.label}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">
                            {entry.driveSeconds > 0 ? formatDuration(entry.driveSeconds) : '—'}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {entry.arrive ? (
                              <span className={legCloseWarn ? 'text-red-700 font-semibold' : ''}>
                                {formatTime(entry.arrive)}{legCloseWarn && ' ⚠'}
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
                          <td className="px-3 py-2 font-medium font-mono">{formatTime(entry.depart)}</td>
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
