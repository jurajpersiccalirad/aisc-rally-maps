import { useEffect, useMemo, useRef, useState } from 'react';
import type { LngLatAlt, ParsedPoint } from '../types';
import { CATEGORY_META } from '../classify/categoryMeta';
import { effectiveCategory } from '../state/selectors';
import { useProject } from '../state/useProject';
import { formatDistance, formatDuration, queryOsrm, type OsrmRoute } from '../lib/osrm';

// ── types ─────────────────────────────────────────────────────────────────────

interface Stop {
  id: string;
  pointId: string;
  label?: string;
}

interface StageSchedule {
  stageId: string;
  stageName: string;
  startTime: string; // "HH:MM"
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
  routeA: OsrmRoute | null;
  routeB: OsrmRoute | null;
  error: string | null;
}

const DEFAULT_CLOSURE: ClosureParams = {
  publicMinutes: 120,
  orgMinutes: 60,
  safetyMinutes: 30,
  role: 'org',
};

function effectiveClosureMinutes(p: ClosureParams): number {
  if (p.role === 'public') return p.publicMinutes;
  if (p.role === 'safety') return p.safetyMinutes;
  return p.orgMinutes;
}

let stopSeq = 0;
function newStop(pointId: string): Stop {
  return { id: `stop-${++stopSeq}`, pointId };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function pointLabel(p: ParsedPoint): string {
  const cat = effectiveCategory(p);
  return `${p.name || CATEGORY_META[cat].label} (${CATEGORY_META[cat].label})`;
}

function safeUntil(
  stageStartTime: string,
  closureMinutes: number,
  date: string,
): Date {
  const [h, m] = stageStartTime.split(':').map(Number);
  const start = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  return new Date(start.getTime() - closureMinutes * 60_000);
}

// ── map overlay component ─────────────────────────────────────────────────────

function RouteMap({ legs, stops, points }: {
  legs: RoutedLeg[];
  stops: Stop[];
  points: ParsedPoint[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const layersRef = useRef<unknown[]>([]);

  useEffect(() => {
    // Dynamically import Leaflet to avoid SSR issues
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

      // Clear previous layers
      for (const layer of layersRef.current) {
        (layer as { remove(): void }).remove();
      }
      layersRef.current = [];

      const bounds: [number, number][] = [];

      // Draw numbered stop markers
      stops.forEach((stop, idx) => {
        const point = points.find((p) => p.id === stop.pointId);
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
          .bindTooltip(`${num}: ${stop.label ?? pointLabel(point)}`)
          .addTo(map);
        layersRef.current.push(marker);
      });

      // Draw routes
      for (const leg of legs) {
        if (leg.routeA?.geometry) {
          const coords = leg.routeA.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          const line = L.polyline(coords, { color: '#2563eb', weight: 3, opacity: 0.8, dashArray: undefined }).addTo(map);
          layersRef.current.push(line);
          bounds.push(...coords);
        }
        if (leg.routeB?.geometry) {
          const coords = leg.routeB.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          const line = L.polyline(coords, { color: '#dc2626', weight: 3, opacity: 0.6, dashArray: '6 4' }).addTo(map);
          layersRef.current.push(line);
        }
      }

      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
      }
    })();
  }, [legs, stops, points]);

  return <div ref={mapRef} className="w-full h-64 rounded border border-slate-200 z-0" />;
}

// ── main component ────────────────────────────────────────────────────────────

export function DeploymentPlanner({ onClose }: { onClose: () => void }) {
  const state = useProject();
  const allPoints = state.points;

  const [originId, setOriginId] = useState<string>('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [schedule, setSchedule] = useState<StageSchedule[]>(() =>
    state.stages.map((s) => ({ stageId: s.id, stageName: s.exportName, startTime: '10:00' })),
  );
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [closure, setClosure] = useState<ClosureParams>(DEFAULT_CLOSURE);
  const [legs, setLegs] = useState<RoutedLeg[]>([]);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const closureMinutes = effectiveClosureMinutes(closure);

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
    const newLegs: RoutedLeg[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const fromCoord: LngLatAlt = from.point.coord;
      const toCoord: LngLatAlt = to.point.coord;
      try {
        const result = await queryOsrm([fromCoord, toCoord], true);
        newLegs.push({
          from: pointLabel(from.point),
          to: pointLabel(to.point),
          routeA: result.routes[0] ?? null,
          routeB: result.routes[1] ?? null,
          error: null,
        });
      } catch (e) {
        newLegs.push({
          from: pointLabel(from.point),
          to: pointLabel(to.point),
          routeA: null,
          routeB: null,
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

  // Departure time calculation: estimate cumulative travel time
  const departureTimes = useMemo(() => {
    const times: { legIdx: number; departBy: Date | null; status: 'ok' | 'tight' | 'closed' }[] = [];
    let cumSeconds = 0;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const travelSeconds = leg.routeA?.duration ?? leg.routeB?.duration ?? 0;
      cumSeconds += travelSeconds;
      // Find which stages are passed in this leg (simplistic: all stages for now)
      const closedAt = schedule.map((sch) => safeUntil(sch.startTime, closureMinutes, eventDate));
      const earliestClose = closedAt.length > 0 ? closedAt.reduce((a, b) => (a < b ? a : b)) : null;
      if (!earliestClose) { times.push({ legIdx: i, departBy: null, status: 'ok' }); continue; }
      const baseTime = new Date();
      const arrivalAtLeg = new Date(baseTime.getTime() + cumSeconds * 1000);
      const status = arrivalAtLeg < earliestClose ? 'ok' : arrivalAtLeg < new Date(earliestClose.getTime() + 30 * 60_000) ? 'tight' : 'closed';
      times.push({ legIdx: i, departBy: earliestClose, status });
    }
    return times;
  }, [legs, schedule, closureMinutes, eventDate]);

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Deployment planner</h2>
        <button type="button" onClick={onClose}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
          ← Back to editor
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Setup */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Origin + stops */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Visit sequence</h3>

              <label className="block text-xs">
                <span className="font-medium text-slate-700">Origin (Service Park / Rally HQ)</span>
                <select
                  value={originId}
                  onChange={(e) => setOriginId(e.target.value)}
                  className="mt-1 w-full text-xs rounded border border-slate-300 px-2 py-1.5"
                >
                  <option value="">— select origin point —</option>
                  {allPoints.map((p) => (
                    <option key={p.id} value={p.id}>{pointLabel(p)}</option>
                  ))}
                </select>
              </label>

              <div className="space-y-1">
                {stops.map((stop, idx) => {
                  const pt = allPoints.find((p) => p.id === stop.pointId);
                  return (
                    <div key={stop.id} className="flex items-center gap-1 text-xs rounded border border-slate-200 bg-white px-2 py-1.5">
                      <span className="text-slate-400 w-4 text-center">{idx + 1}</span>
                      <span className="flex-1 truncate">{pt ? pointLabel(pt) : '—'}</span>
                      <button type="button" onClick={() => moveStop(idx, -1)} disabled={idx === 0}
                        className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => moveStop(idx, 1)} disabled={idx === stops.length - 1}
                        className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                      <button type="button"
                        onClick={() => setStops(stops.filter((_, i) => i !== idx))}
                        className="px-1 text-slate-400 hover:text-red-600">✕</button>
                    </div>
                  );
                })}
              </div>

              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setStops([...stops, newStop(e.target.value)]);
                  e.target.value = '';
                }}
                className="w-full text-xs rounded border border-dashed border-slate-300 px-2 py-1.5 hover:border-slate-500"
              >
                <option value="">+ Add stop…</option>
                {allPoints
                  .filter((p) => p.id !== originId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{pointLabel(p)}</option>
                  ))}
              </select>
            </div>

            {/* Schedule + closure */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Stage schedule</h3>
              <label className="block text-xs">
                <span className="font-medium text-slate-700">Event date</span>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs" />
              </label>
              <div className="space-y-1">
                {schedule.map((sch, i) => (
                  <label key={sch.stageId} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-700 w-16 truncate">{sch.stageName}</span>
                    <input type="time" value={sch.startTime}
                      onChange={(e) => {
                        const next = [...schedule];
                        next[i] = { ...next[i], startTime: e.target.value };
                        setSchedule(next);
                      }}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs" />
                    <span className="text-slate-400">start</span>
                  </label>
                ))}
              </div>

              <h3 className="text-sm font-semibold text-slate-700 pt-1">Road closure window</h3>
              <div className="flex gap-2 flex-wrap text-xs">
                {(['public', 'org', 'safety'] as const).map((role) => (
                  <button key={role} type="button"
                    onClick={() => setClosure((c) => ({ ...c, role }))}
                    className={[
                      'px-2 py-1 rounded border',
                      closure.role === role ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-50',
                    ].join(' ')}>
                    {role === 'public' ? `Public (T−${closure.publicMinutes}min)` :
                      role === 'org' ? `Org team (T−${closure.orgMinutes}min)` :
                        `Safety delegate (T−${closure.safetyMinutes}min)`}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {([
                  { key: 'publicMinutes', label: 'Public cutoff (min)' },
                  { key: 'orgMinutes', label: 'Org cutoff (min)' },
                  { key: 'safetyMinutes', label: 'Safety cutoff (min)' },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="block">
                    <span className="text-slate-600">{label}</span>
                    <input type="number" min={0} value={closure[key]}
                      onChange={(e) => setClosure((c) => ({ ...c, [key]: parseInt(e.target.value) || 0 }))}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-0.5 font-mono" />
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Calculate button */}
          <button
            type="button"
            disabled={waypoints.length < 2 || routing}
            onClick={() => void calculateRoutes()}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {routing ? 'Calculating routes via OSRM…' : `Calculate routes (${waypoints.length - 1} leg${waypoints.length !== 2 ? 's' : ''})`}
          </button>

          {routeError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{routeError}</div>
          )}

          {/* Results */}
          {legs.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Route itinerary</h3>

              {/* Legend */}
              <div className="flex gap-4 text-[11px] text-slate-600">
                <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-blue-600 inline-block" /> Route A (direct / via stage)</span>
                <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-red-500 inline-block border-dashed" style={{ borderTop: '2px dashed' }} /> Route B (alternative)</span>
              </div>

              {/* Map */}
              <RouteMap legs={legs} stops={[{ id: 'origin', pointId: originId }, ...stops]} points={allPoints} />

              {/* Leg table */}
              <ul className="space-y-2">
                {legs.map((leg, i) => {
                  const timing = departureTimes[i];
                  const statusColor = !timing ? '' :
                    timing.status === 'ok' ? 'border-emerald-200 bg-emerald-50' :
                      timing.status === 'tight' ? 'border-amber-200 bg-amber-50' :
                        'border-red-200 bg-red-50';

                  return (
                    <li key={i} className={`rounded border px-3 py-2 space-y-1 text-xs ${statusColor || 'border-slate-200 bg-white'}`}>
                      <div className="font-medium text-slate-700">
                        Leg {i + 1}: {leg.from} → {leg.to}
                      </div>
                      {leg.error ? (
                        <div className="text-red-700">Routing failed: {leg.error}</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-600">
                          {leg.routeA && (
                            <>
                              <span className="text-blue-700 font-medium">Route A</span>
                              <span>{formatDistance(leg.routeA.distance)} · {formatDuration(leg.routeA.duration)}</span>
                            </>
                          )}
                          {leg.routeB && (
                            <>
                              <span className="text-red-600 font-medium">Route B</span>
                              <span>{formatDistance(leg.routeB.distance)} · {formatDuration(leg.routeB.duration)}</span>
                            </>
                          )}
                          {timing?.departBy && (
                            <>
                              <span className="font-medium">Stage road closes</span>
                              <span>{timing.departBy.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </>
                          )}
                        </div>
                      )}
                      {timing?.status === 'tight' && (
                        <div className="text-amber-800">⚠ Tight window — use Route B or depart earlier.</div>
                      )}
                      {timing?.status === 'closed' && (
                        <div className="text-red-800">✗ Stage road likely closed at estimated arrival — use Route B.</div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Summary */}
              {legs.every((l) => l.routeA || l.routeB) && (
                <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold">Total via Route A: </span>
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
