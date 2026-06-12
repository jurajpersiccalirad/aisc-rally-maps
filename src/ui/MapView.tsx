import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  along as turfAlong,
  bearing as turfBearing,
  length as turfLength,
  lineString,
} from '@turf/turf';
import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  Marker,
  Polygon as LPolygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { CATEGORY_META } from '../classify/categoryMeta';
import type { RingMP } from '../geometry/bufferStage';
import { formatCoord } from '../lib/formatCoord';
import {
  effectiveCategory,
  getEffectivePointStages,
  getStageDerivedGeometry,
  getStageJoinedGeometry,
  getStageLegTracks,
  getStagedTrackIds,
  snapToStageFraction,
} from '../state/selectors';
import { useProject, useProjectDispatch } from '../state/useProject';
import { useStageGeometry } from '../state/useStageGeometry';
import type {
  LngLatAlt,
  ParsedPoint,
  ParsedTrack,
  ProjectState,
  Stage,
} from '../types';
import { categoryDivIcon } from './markers/CategoryMarker';
import type {
  CropMode,
  FocusTarget,
  HoverState,
  MapEditMode,
  Visibility,
} from './workspaceTypes';

const TRACK_PALETTE = [
  '#0288d1',
  '#f59e0b',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#0ea5e9',
  '#84cc16',
  '#ec4899',
];

const zoneVertexIcon = L.divIcon({
  className: '',
  html: '<div style="width:10px;height:10px;border-radius:50%;background:white;border:2px solid #7c3aed;cursor:move;box-sizing:border-box;"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function paletteColor(index: number): string {
  return TRACK_PALETTE[index % TRACK_PALETTE.length];
}

function stageColor(
  state: ProjectState,
  stage: Stage,
  stageIndex: number,
): string {
  const firstTrack = state.tracks.find((t) => t.id === stage.legs[0]?.trackId);
  return firstTrack?.styleColorHex ?? paletteColor(stageIndex);
}

function toLeafletLatLngs(coords: LngLatAlt[]): [number, number][] {
  return coords.map((c) => [c[1], c[0]]);
}

function mpToLatLngs(mp: RingMP): [number, number][][][] {
  return mp.map((poly) =>
    poly.map((ring) =>
      ring.map(([lng, lat]) => [lat, lng] as [number, number]),
    ),
  );
}

function boundsForCoords(coords: LngLatAlt[]): L.LatLngBounds | null {
  if (coords.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const c of coords) {
    if (c[1] < minLat) minLat = c[1];
    if (c[1] > maxLat) maxLat = c[1];
    if (c[0] < minLng) minLng = c[0];
    if (c[0] > maxLng) maxLng = c[0];
  }
  return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
}

function arrowDivIcon(bearingDeg: number, color: string): L.DivIcon {
  return L.divIcon({
    className: 'aisc-arrow-marker',
    html: `<span style="
      display:block;
      width:0;
      height:0;
      border-left:10px solid transparent;
      border-right:10px solid transparent;
      border-bottom:17px solid ${color};
      transform: rotate(${bearingDeg}deg);
      transform-origin: center;
      filter: drop-shadow(0 0 2px white) drop-shadow(0 0 1px rgba(0,0,0,0.4));
    "></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function endpointDivIcon(
  edge: 'start' | 'end',
  color: string,
  emphasized: boolean,
): L.DivIcon {
  const size = emphasized ? 36 : 30;
  const bg = edge === 'start' ? '#16a34a' : '#dc2626';
  const glyph = edge === 'start' ? '▶' : '■';
  return L.divIcon({
    className: 'aisc-endpoint-marker',
    html: `<span style="
      display:flex;
      align-items:center;
      justify-content:center;
      width:${size}px;
      height:${size}px;
      border-radius:4px;
      background:${bg};
      color:white;
      border:3px solid ${color};
      box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 2px 4px rgba(0,0,0,0.25);
      font-size:13px;
      font-weight:700;
      line-height:1;
      cursor: grab;
      opacity:0.82;
    ">${glyph}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function computeBounds(
  tracks: ParsedTrack[],
  points: ParsedPoint[],
): L.LatLngBounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let seen = false;
  const visit = (lng: number, lat: number) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    seen = true;
  };
  for (const t of tracks) for (const c of t.coords) visit(c[0], c[1]);
  for (const p of points) visit(p.coord[0], p.coord[1]);
  if (!seen) return null;
  return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
}

function FitToData({
  tracks,
  points,
}: {
  tracks: ParsedTrack[];
  points: ParsedPoint[];
}) {
  const map = useMap();
  const bounds = useMemo(() => computeBounds(tracks, points), [tracks, points]);

  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [bounds, map]);

  return null;
}

function CursorForCropMode({ cropMode }: { cropMode: CropMode }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (cropMode) {
      el.style.cursor = 'crosshair';
    } else {
      el.style.cursor = '';
    }
    return () => {
      el.style.cursor = '';
    };
  }, [map, cropMode]);
  return null;
}

function CropClickHandler({
  cropMode,
  setCropMode,
}: {
  cropMode: CropMode;
  setCropMode: (m: CropMode) => void;
}) {
  const state = useProject();
  const dispatch = useProjectDispatch();
  useMapEvents({
    click: (e) => {
      if (!cropMode) return;
      const joined = getStageJoinedGeometry(state, cropMode.stageId);
      if (!joined) return;
      const f = snapToStageFraction(joined, [e.latlng.lng, e.latlng.lat]);
      if (f === null) return;
      dispatch({
        type: 'SET_CROP',
        stageId: cropMode.stageId,
        cropStart: cropMode.edge === 'start' ? f : undefined,
        cropEnd: cropMode.edge === 'end' ? f : undefined,
      });
      setCropMode(null);
    },
  });
  return null;
}

function CursorForEditMode({ mapEditMode }: { mapEditMode: MapEditMode }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (mapEditMode) el.style.cursor = 'crosshair';
    else el.style.cursor = '';
    return () => { el.style.cursor = ''; };
  }, [map, mapEditMode]);
  return null;
}

function MapEditClickHandler({
  mapEditMode,
  onMapEditModeChange,
}: {
  mapEditMode: MapEditMode;
  onMapEditModeChange: (mode: MapEditMode) => void;
}) {
  const dispatch = useProjectDispatch();
  useMapEvents({
    click: (e) => {
      if (!mapEditMode) return;
      const coord: LngLatAlt = [e.latlng.lng, e.latlng.lat];
      if (mapEditMode.kind === 'place_point') {
        dispatch({ type: 'ADD_MANUAL_POINT', name: mapEditMode.name, category: mapEditMode.category, coord });
        onMapEditModeChange(null);
      } else if (mapEditMode.kind === 'draw_zone') {
        onMapEditModeChange({ ...mapEditMode, vertices: [...mapEditMode.vertices, coord] });
      }
    },
  });
  return null;
}

function FocusHandler({ focusTarget }: { focusTarget: FocusTarget | null }) {
  const map = useMap();
  const state = useProject();
  const nonce = focusTarget?.nonce;
  useEffect(() => {
    if (!focusTarget) return;
    const padding: [number, number] = [40, 40];
    if (focusTarget.kind === 'track') {
      const t = state.tracks.find((tr) => tr.id === focusTarget.trackId);
      if (!t || t.coords.length < 2) return;
      const b = boundsForCoords(t.coords);
      if (b) map.fitBounds(b, { padding, maxZoom: 16 });
    } else if (focusTarget.kind === 'stage') {
      const coords = getStageDerivedGeometry(state, focusTarget.stageId);
      if (!coords || coords.length < 2) return;
      const b = boundsForCoords(coords);
      if (b) map.fitBounds(b, { padding, maxZoom: 16 });
    } else {
      const p = state.points.find((pp) => pp.id === focusTarget.pointId);
      if (!p) return;
      map.flyTo([p.coord[1], p.coord[0]], Math.max(map.getZoom(), 14));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);
  return null;
}

interface StageLayerProps {
  stage: Stage;
  stageIndex: number;
  hovered: boolean;
  bufferedMp?: RingMP;
  showBuffer: boolean;
  hasOverlap: boolean;
  showArrows: boolean;
  showStartMarker: boolean;
  showEndMarker: boolean;
  onSelectStage?: (id: string) => void;
}

function StageLayer({
  stage,
  stageIndex,
  hovered,
  bufferedMp,
  showBuffer,
  hasOverlap,
  showArrows,
  showStartMarker,
  showEndMarker,
  onSelectStage,
}: StageLayerProps) {
  const state = useProject();

  const derived = useMemo(
    () => getStageDerivedGeometry(state, stage.id),
    [state, stage.id],
  );
  const joined = useMemo(
    () => getStageJoinedGeometry(state, stage.id),
    [state, stage.id],
  );
  const legTracks = useMemo(
    () => getStageLegTracks(state, stage),
    [state, stage],
  );

  const color = stageColor(state, stage, stageIndex);

  const arrows = useMemo(() => {
    if (!derived || derived.length < 2) return [];
    const flat = derived.map((c) => [c[0], c[1]] as [number, number]);
    const line = lineString(flat);
    const total = turfLength(line, { units: 'kilometers' });
    if (total <= 0) return [];
    const count = Math.max(3, Math.min(20, Math.floor(total / 4)));
    const result: { coord: LngLatAlt; bearing: number }[] = [];
    for (let i = 1; i <= count; i++) {
      const frac = i / (count + 1);
      const km = frac * total;
      const p1 = turfAlong(line, km, { units: 'kilometers' });
      const p2 = turfAlong(line, Math.min(km + 0.05, total), {
        units: 'kilometers',
      });
      const brg = turfBearing(p1, p2);
      result.push({
        coord: [
          p1.geometry.coordinates[0],
          p1.geometry.coordinates[1],
        ] as LngLatAlt,
        bearing: brg,
      });
    }
    return result;
  }, [derived]);

  if (!derived || derived.length < 2 || !joined || joined.length < 2) {
    return null;
  }

  const totalLen =
    derived.length >= 2
      ? turfLength(
          lineString(derived.map((c) => [c[0], c[1]])),
          { units: 'kilometers' },
        )
      : 0;

  return (
    <>
      {showBuffer && bufferedMp && bufferedMp.length > 0 && (
        <LPolygon
          positions={mpToLatLngs(bufferedMp)}
          pathOptions={{
            color,
            weight: 1,
            opacity: 0.6,
            fillColor: color,
            fillOpacity: hasOverlap ? 0.1 : 0.18,
          }}
          interactive={false}
        />
      )}

      <Polyline
        positions={toLeafletLatLngs(derived)}
        pathOptions={{
          color,
          weight: hovered ? 7 : 5,
          opacity: 0.95,
        }}
        eventHandlers={onSelectStage ? { click: () => onSelectStage(stage.id) } : undefined}
      >
        <Tooltip sticky>
          <div className="text-xs">
            <div className="font-semibold">{stage.exportName}</div>
            <div className="text-slate-500">
              {totalLen.toFixed(2)} km · {stage.legs.length} leg
              {stage.legs.length > 1 ? 's' : ''}
            </div>
            <div className="text-slate-400 italic">
              {legTracks.map((t) => t.name || '?').join(' → ')}
            </div>
          </div>
        </Tooltip>
      </Polyline>

      {showArrows && arrows.map((a, i) => (
        <Marker
          key={`arrow-${i}`}
          position={[a.coord[1], a.coord[0]]}
          icon={arrowDivIcon(a.bearing, color)}
          interactive={false}
        />
      ))}

      {showStartMarker && (
        <Marker
          position={[derived[0][1], derived[0][0]]}
          icon={endpointDivIcon('start', color, hovered)}
          zIndexOffset={-200}
          eventHandlers={onSelectStage ? { click: () => onSelectStage(stage.id) } : undefined}
        >
          <Tooltip>{stage.exportName} start</Tooltip>
        </Marker>
      )}

      {showEndMarker && (
        <Marker
          position={[derived[derived.length - 1][1], derived[derived.length - 1][0]]}
          icon={endpointDivIcon('end', color, hovered)}
          zIndexOffset={-200}
          eventHandlers={onSelectStage ? { click: () => onSelectStage(stage.id) } : undefined}
        >
          <Tooltip>{stage.exportName} end</Tooltip>
        </Marker>
      )}

    </>
  );
}

const DEFAULT_CENTER: [number, number] = [50, 10];
const DEFAULT_ZOOM = 4;

interface Props {
  hover: HoverState | null;
  setHover: (h: HoverState | null) => void;
  cropMode: CropMode;
  setCropMode: (m: CropMode) => void;
  visibility: Visibility;
  focusTarget: FocusTarget | null;
  mapEditMode: MapEditMode;
  onMapEditModeChange: (mode: MapEditMode) => void;
  onSelectPoint?: (id: string) => void;
  onSelectStage?: (id: string) => void;
}

export function MapView({
  hover,
  setHover,
  cropMode,
  setCropMode,
  visibility,
  focusTarget,
  mapEditMode,
  onMapEditModeChange,
  onSelectPoint,
  onSelectStage,
}: Props) {
  const state = useProject();
  const { tracks, points, stages } = state;
  const stagedIds = useMemo(() => getStagedTrackIds(state), [state]);
  const stageMap = useMemo(() => getEffectivePointStages(state), [state]);
  const geometry = useStageGeometry();
  const collocated = useMemo(() => {
    const THRESH = 0.0001; // ~11 m in degrees
    const map = new Map<string, ParsedPoint[]>();
    for (const p of points) {
      const nearby = points.filter(
        (q) =>
          q.id !== p.id &&
          Math.abs(q.coord[0] - p.coord[0]) < THRESH &&
          Math.abs(q.coord[1] - p.coord[1]) < THRESH,
      );
      if (nearby.length > 0) map.set(p.id, nearby);
    }
    return map;
  }, [points]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      maxZoom={22}
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxNativeZoom={19}
        maxZoom={22}
      />

      <CursorForCropMode cropMode={cropMode} />
      <CropClickHandler cropMode={cropMode} setCropMode={setCropMode} />
      <CursorForEditMode mapEditMode={mapEditMode} />
      <MapEditClickHandler mapEditMode={mapEditMode} onMapEditModeChange={onMapEditModeChange} />
      <FocusHandler focusTarget={focusTarget} />

      {/* Unassigned tracks rendered dim & thin */}
      {tracks
        .filter(
          (t) =>
            !stagedIds.has(t.id) && !visibility.hiddenTrackIds.has(t.id),
        )
        .map((t, i) => {
          const color = t.styleColorHex ?? paletteColor(i);
          const isHovered =
            hover?.kind === 'track' && hover.trackId === t.id;
          return (
            <Polyline
              key={t.id}
              positions={toLeafletLatLngs(t.coords)}
              pathOptions={{
                color,
                weight: isHovered ? 6 : 3,
                opacity: isHovered ? 0.85 : 0.4,
                dashArray: '6 6',
              }}
              eventHandlers={{
                mouseover: () => setHover({ kind: 'track', trackId: t.id }),
                mouseout: () => setHover(null),
              }}
            >
              <Tooltip sticky>
                <div className="text-xs">
                  <div className="font-semibold">
                    {t.name || '(unnamed)'} — unassigned
                  </div>
                  <div className="text-slate-500">
                    {t.lengthKm.toFixed(2)} km · {t.coords.length} pts
                  </div>
                  {t.folderPath.length > 0 && (
                    <div className="text-slate-400 italic">
                      {t.folderPath.join(' › ')}
                    </div>
                  )}
                </div>
              </Tooltip>
            </Polyline>
          );
        })}

      {/* One joined polyline per visible stage */}
      {stages
        .filter((s) => !visibility.hiddenStageIds.has(s.id))
        .map((s) => {
          const stageIndex = stages.findIndex((x) => x.id === s.id);
          return (
            <StageLayer
              key={s.id}
              stage={s}
              stageIndex={stageIndex}
              hovered={hover?.kind === 'stage' && hover.stageId === s.id}
              bufferedMp={geometry.buffered.get(s.id)}
              showBuffer={visibility.showBuffers}
              hasOverlap={(geometry.overlapsFor.get(s.id) ?? []).length > 0}
              showArrows={visibility.showArrows}
              showStartMarker={visibility.showStartMarkers}
              showEndMarker={visibility.showEndMarkers}
              onSelectStage={onSelectStage}
            />
          );
        })}

      {/* Intersection regions (always rendered red, regardless of buffer toggle) */}
      {visibility.showBuffers &&
        geometry.intersections
          .filter(
            ({ a, b }) =>
              !visibility.hiddenStageIds.has(a) &&
              !visibility.hiddenStageIds.has(b),
          )
          .map(({ a, b, region }, i) => (
            <LPolygon
              key={`xs-${a}-${b}-${i}`}
              positions={mpToLatLngs(region)}
              pathOptions={{
                color: '#dc2626',
                weight: 1,
                opacity: 0.9,
                fillColor: '#dc2626',
                fillOpacity: 0.35,
              }}
              interactive={false}
            />
          ))}

      {/* Points */}
      {points.map((p) => {
        const cat = effectiveCategory(p);
        if (visibility.hiddenCategories.has(cat)) return null;
        if (visibility.hiddenPointIds.has(p.id)) return null;
        const stageId = stageMap.get(p.id) ?? null;
        if (stageId && visibility.hiddenStageIds.has(stageId)) return null;
        const emphasized =
          stageId !== null &&
          hover?.kind === 'stage' &&
          hover.stageId === stageId;
        const stageName = stageId
          ? state.stages.find((s) => s.id === stageId)?.exportName
          : undefined;
        return (
          <Marker
            key={p.id}
            position={[p.coord[1], p.coord[0]]}
            icon={categoryDivIcon(cat, emphasized)}
            zIndexOffset={300}
            eventHandlers={onSelectPoint ? { click: () => onSelectPoint(p.id) } : undefined}
          >
            <Tooltip>
              <div className="text-xs space-y-0.5">
                <div className="flex items-center gap-1">
                  <span
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold"
                    style={{
                      background: CATEGORY_META[cat].color,
                      color: CATEGORY_META[cat].textOnColor,
                    }}
                  >
                    {CATEGORY_META[cat].glyph}
                  </span>
                  <span className="font-semibold">
                    {p.name || p.description || '(unnamed)'}
                  </span>
                </div>
                <div className="text-slate-500">
                  {CATEGORY_META[cat].label}
                  {stageName && ` · ${stageName}`}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {formatCoord(p.coord[0], p.coord[1], visibility.coordFormat)}
                </div>
                {p.folderPath.length > 0 && (
                  <div className="text-slate-400 italic">
                    {p.folderPath.join(' › ')}
                  </div>
                )}
                {(collocated.get(p.id) ?? []).length > 0 && (
                  <div className="border-t border-slate-200 mt-1 pt-1 space-y-0.5">
                    <div className="text-[10px] text-slate-400">Also here:</div>
                    {(collocated.get(p.id) ?? []).map((q) => {
                      const qCat = effectiveCategory(q);
                      const qStageId = stageMap.get(q.id) ?? null;
                      const qStageName = qStageId
                        ? stages.find((s) => s.id === qStageId)?.exportName
                        : undefined;
                      return (
                        <div key={q.id} className="flex items-center gap-1">
                          <span
                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold flex-shrink-0"
                            style={{
                              background: CATEGORY_META[qCat].color,
                              color: CATEGORY_META[qCat].textOnColor,
                            }}
                          >
                            {CATEGORY_META[qCat].glyph}
                          </span>
                          <span>{q.name || q.description || '(unnamed)'}</span>
                          {qStageName && (
                            <span className="text-slate-400">· {qStageName}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Tooltip>
          </Marker>
        );
      })}

      {/* Manual zones */}
      {(state.manualZones ?? []).map((zone) => {
        const meta = CATEGORY_META[zone.category];
        return (
          <LPolygon
            key={zone.id}
            positions={zone.coords.map((c) => [c[1], c[0]] as [number, number])}
            pathOptions={{ color: meta.color, fillColor: meta.color, fillOpacity: 0.18, weight: 2 }}
          >
            <Tooltip sticky>{zone.name}</Tooltip>
          </LPolygon>
        );
      })}

      {/* Pending zone being drawn */}
      {mapEditMode?.kind === 'draw_zone' && mapEditMode.vertices.length >= 2 && (
        <LPolygon
          positions={mapEditMode.vertices.map((v) => [v[1], v[0]] as [number, number])}
          pathOptions={{ color: '#7c3aed', fillOpacity: 0.12, dashArray: '6 4', weight: 2 }}
          interactive={false}
        />
      )}
      {mapEditMode?.kind === 'draw_zone' &&
        mapEditMode.vertices.map((v, i) => (
          <Marker
            key={i}
            position={[v[1], v[0]]}
            draggable
            icon={zoneVertexIcon}
            eventHandlers={{
              dragend(e) {
                const ll = (e.target as L.Marker).getLatLng();
                const verts = [...mapEditMode.vertices];
                verts[i] = [ll.lng, ll.lat, 0];
                onMapEditModeChange({ ...mapEditMode, vertices: verts });
              },
            }}
          />
        ))}

      <FitToData tracks={tracks} points={points} />
    </MapContainer>
  );
}
