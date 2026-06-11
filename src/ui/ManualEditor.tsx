import { useState } from 'react';
import { CATEGORY_META, CATEGORY_ORDER } from '../classify/categoryMeta';
import { parseCoordInput } from '../lib/formatCoord';
import { effectiveCategory } from '../state/selectors';
import { useProject, useProjectDispatch } from '../state/useProject';
import type { PointCategory, ZoneCategory } from '../types';
import type { MapEditMode } from './workspaceTypes';

const ZONE_CATS: ZoneCategory[] = ['service_park', 'parc_ferme', 'hq', 'other'];

interface Props {
  mapEditMode: MapEditMode;
  onMapEditModeChange: (mode: MapEditMode) => void;
}

export function ManualEditor({ mapEditMode, onMapEditModeChange }: Props) {
  const state = useProject();
  const dispatch = useProjectDispatch();

  const [pointName, setPointName] = useState('');
  const [pointCat, setPointCat] = useState<PointCategory>('other');
  const [coordInput, setCoordInput] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [zoneCat, setZoneCat] = useState<ZoneCategory>('other');

  const parsedCoord = parseCoordInput(coordInput);
  const canPlaceByCoord = !!parsedCoord && pointName.trim().length > 0;

  const manualPoints = state.points.filter((p) => p.sourceFileId === '__manual__');
  const zones = state.manualZones ?? [];

  const isPlacing = mapEditMode?.kind === 'place_point';
  const isDrawing = mapEditMode?.kind === 'draw_zone';

  const startPlace = () => {
    if (!pointName.trim()) return;
    onMapEditModeChange({ kind: 'place_point', name: pointName.trim(), category: pointCat });
  };

  const startDraw = () => {
    if (!zoneName.trim()) return;
    onMapEditModeChange({ kind: 'draw_zone', name: zoneName.trim(), category: zoneCat, vertices: [] });
  };

  const finishZone = () => {
    if (mapEditMode?.kind !== 'draw_zone' || mapEditMode.vertices.length < 3) return;
    dispatch({ type: 'ADD_ZONE', name: mapEditMode.name, category: mapEditMode.category, coords: mapEditMode.vertices });
    setZoneName('');
    onMapEditModeChange(null);
  };

  const cancel = () => onMapEditModeChange(null);

  const placeByCoord = () => {
    if (!parsedCoord || !pointName.trim()) return;
    dispatch({ type: 'ADD_MANUAL_POINT', name: pointName.trim(), category: pointCat, coord: [parsedCoord[0], parsedCoord[1], 0] });
    setCoordInput('');
  };

  const hasContent = manualPoints.length > 0 || zones.length > 0;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
        Manual Points &amp; Zones
      </h3>

      {/* Add Point */}
      {!isDrawing && (
        <div className="rounded border border-slate-200 bg-white p-2 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Point</div>
          <div className="flex gap-1">
            <input
              type="text"
              value={pointName}
              onChange={(e) => setPointName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') startPlace(); if (e.key === 'Escape') cancel(); }}
              placeholder="Name"
              disabled={isPlacing}
              className="flex-1 min-w-0 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-50"
            />
            <select
              value={pointCat}
              onChange={(e) => setPointCat(e.target.value as PointCategory)}
              disabled={isPlacing}
              className="rounded border border-slate-300 px-1 py-0.5 text-xs disabled:bg-slate-50 max-w-[110px]"
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{CATEGORY_META[c].label}</option>
              ))}
            </select>
          </div>
          {isPlacing ? (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-amber-700 font-medium animate-pulse">Click map to place &ldquo;{mapEditMode.name}&rdquo;</span>
              <button type="button" onClick={cancel} className="text-[11px] text-slate-500 hover:text-red-600">Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startPlace}
              disabled={!pointName.trim()}
              className="w-full text-xs py-1 rounded bg-slate-800 text-white hover:bg-slate-700 disabled:bg-slate-300"
            >
              Place on map
            </button>
          )}
          <div className="border-t border-slate-100 pt-1.5 space-y-1">
            <div className="text-[10px] text-slate-400">or enter coordinates (lat, lng):</div>
            <div className="flex gap-1">
              <input
                type="text"
                value={coordInput}
                onChange={(e) => setCoordInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canPlaceByCoord) placeByCoord(); }}
                placeholder="e.g. 60.12345, 25.45678"
                disabled={isPlacing}
                className={[
                  'flex-1 min-w-0 rounded border px-1.5 py-1 text-[11px] font-mono disabled:bg-slate-50',
                  coordInput && !parsedCoord ? 'border-red-300' : 'border-slate-300',
                ].join(' ')}
              />
              <button
                type="button"
                onClick={placeByCoord}
                disabled={!canPlaceByCoord}
                className="text-[11px] px-2 py-1 rounded bg-slate-800 text-white hover:bg-slate-700 disabled:bg-slate-300 flex-shrink-0"
                title={!pointName.trim() ? 'Enter a name first' : !parsedCoord ? 'Invalid coordinates' : 'Add point at this coordinate'}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draw Zone */}
      {!isPlacing && (
        <div className="rounded border border-slate-200 bg-white p-2 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Zone (polygon)</div>
          <div className="flex gap-1">
            <input
              type="text"
              value={isDrawing ? mapEditMode.name : zoneName}
              onChange={(e) => { if (!isDrawing) setZoneName(e.target.value); }}
              placeholder="Zone name"
              disabled={isDrawing}
              className="flex-1 min-w-0 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-50"
            />
            <select
              value={isDrawing ? mapEditMode.category : zoneCat}
              onChange={(e) => { if (!isDrawing) setZoneCat(e.target.value as ZoneCategory); }}
              disabled={isDrawing}
              className="rounded border border-slate-300 px-1 py-0.5 text-xs disabled:bg-slate-50 max-w-[110px]"
            >
              {ZONE_CATS.map((c) => (
                <option key={c} value={c}>{CATEGORY_META[c].label}</option>
              ))}
            </select>
          </div>
          {isDrawing ? (
            <div className="space-y-1">
              <div className="text-[11px] text-amber-700 font-medium animate-pulse">
                Click map to add vertices ({mapEditMode.vertices.length} placed)
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={finishZone}
                  disabled={mapEditMode.vertices.length < 3}
                  className="flex-1 text-xs py-1 rounded bg-green-700 text-white hover:bg-green-600 disabled:bg-slate-300"
                >
                  Finish zone ({mapEditMode.vertices.length} pts)
                </button>
                <button type="button" onClick={cancel} className="text-xs py-1 px-2 rounded border border-slate-300 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startDraw}
              disabled={!zoneName.trim()}
              className="w-full text-xs py-1 rounded bg-slate-800 text-white hover:bg-slate-700 disabled:bg-slate-300"
            >
              Start drawing
            </button>
          )}
        </div>
      )}

      {/* Lists */}
      {hasContent && (
        <div className="rounded border border-slate-200 bg-white">
          {manualPoints.length > 0 && (
            <>
              <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                Manual points ({manualPoints.length})
              </div>
              <ul className="px-2 py-1.5 space-y-0.5">
                {manualPoints.map((p) => {
                  const cat = effectiveCategory(p);
                  const meta = CATEGORY_META[cat];
                  return (
                    <li key={p.id} className="flex items-center gap-1 group">
                      <span
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold flex-shrink-0"
                        style={{ background: meta.color, color: meta.textOnColor }}
                      >
                        {meta.glyph}
                      </span>
                      <span className="flex-1 text-xs truncate">{p.name || '(unnamed)'}</span>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'REMOVE_MANUAL_POINT', pointId: p.id })}
                        className="text-slate-300 hover:text-red-500 text-sm leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {zones.length > 0 && (
            <>
              <div className={`px-2 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 ${manualPoints.length > 0 ? 'border-t' : ''}`}>
                Zones ({zones.length})
              </div>
              <ul className="px-2 py-1.5 space-y-0.5">
                {zones.map((z) => {
                  const meta = CATEGORY_META[z.category];
                  return (
                    <li key={z.id} className="flex items-center gap-1 group">
                      <span
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold flex-shrink-0"
                        style={{ background: meta.color, color: meta.textOnColor }}
                      >
                        {meta.glyph}
                      </span>
                      <span className="flex-1 text-xs truncate">{z.name}</span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{z.coords.length} pts</span>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'REMOVE_ZONE', zoneId: z.id })}
                        className="text-slate-300 hover:text-red-500 text-sm leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
