import { useMemo, useState } from 'react';
import { CATEGORY_META, CATEGORY_ORDER, REQUIRED_STAGE_CATEGORIES } from '../classify/categoryMeta';
import {
  effectiveCategory,
  getPreStartTc,
  getStageAssignedPoints,
  getStagedTrackIds,
  getStageLegTracks,
  getStageLengthKm,
  getStageStartEnd,
} from '../state/selectors';
import { useProject, useProjectDispatch } from '../state/useProject';
import type { LngLatAlt, PointCategory, Stage } from '../types';
import { EyeIcon, EyeOffIcon, TargetIcon } from './icons';
import type { CropMode, HoverState } from './workspaceTypes';

interface Props {
  stage: Stage;
  duplicateName: boolean;
  setHover: (h: HoverState | null) => void;
  cropMode: CropMode;
  setCropMode: (m: CropMode) => void;
  hidden: boolean;
  onToggleVisible: () => void;
  onFocus: () => void;
  overlapsWith: string[];
  onFocusStage: (stageId: string) => void;
}

function formatCoord(c: LngLatAlt): string {
  return `${c[1].toFixed(6)}, ${c[0].toFixed(6)}`;
}

export function StageCard({
  stage,
  duplicateName,
  setHover,
  cropMode,
  setCropMode,
  hidden,
  onToggleVisible,
  onFocus,
  overlapsWith,
  onFocusStage,
}: Props) {
  const state = useProject();
  const dispatch = useProjectDispatch();
  const legTracks = useMemo(
    () => getStageLegTracks(state, stage),
    [state, stage],
  );
  const lengthKm = useMemo(
    () => getStageLengthKm(state, stage.id),
    [state, stage.id],
  );
  const ends = useMemo(
    () => getStageStartEnd(state, stage.id),
    [state, stage.id],
  );
  const assignedPoints = useMemo(
    () => getStageAssignedPoints(state, stage.id),
    [state, stage.id],
  );
  const preStartTc = useMemo(
    () => getPreStartTc(state, stage.id),
    [state, stage.id],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<PointCategory, number>();
    for (const p of assignedPoints) {
      const cat = effectiveCategory(p);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [assignedPoints]);

  const stagedIds = useMemo(() => getStagedTrackIds(state), [state]);
  const unassignedTracks = useMemo(
    () => state.tracks.filter((t) => !stagedIds.has(t.id)),
    [state.tracks, stagedIds],
  );

  const [showAddTrack, setShowAddTrack] = useState(false);

  const overlapNames = useMemo(
    () =>
      overlapsWith
        .map((id) => state.stages.find((s) => s.id === id)?.exportName)
        .filter((n): n is string => !!n),
    [overlapsWith, state.stages],
  );

  if (legTracks.length === 0) return null;
  const primaryTrack = legTracks[0];

  const isCroppingStart =
    cropMode?.stageId === stage.id && cropMode.edge === 'start';
  const isCroppingEnd =
    cropMode?.stageId === stage.id && cropMode.edge === 'end';

  return (
    <div
      onMouseEnter={() => setHover({ kind: 'stage', stageId: stage.id })}
      onMouseLeave={() => setHover(null)}
      className={[
        'rounded border shadow-sm p-3 space-y-2',
        hidden
          ? 'border-slate-200 bg-slate-100 opacity-70'
          : overlapsWith.length > 0
            ? 'border-red-300 bg-white'
            : 'border-slate-300 bg-white',
      ].join(' ')}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={onToggleVisible}
          className="text-slate-500 hover:text-slate-900 p-0.5 mt-1 flex-shrink-0"
          title={hidden ? 'Show on map' : 'Hide from map'}
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        {primaryTrack.styleColorHex && (
          <span
            className="inline-block w-3 h-3 rounded-sm border border-slate-300 mt-2 flex-shrink-0"
            style={{ backgroundColor: primaryTrack.styleColorHex }}
          />
        )}
        <input
          type="text"
          value={stage.exportName}
          onChange={(e) =>
            dispatch({
              type: 'RENAME_STAGE',
              stageId: stage.id,
              exportName: e.target.value,
            })
          }
          className={[
            'flex-1 min-w-0 font-mono text-sm rounded border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400',
            duplicateName ? 'border-red-400 bg-red-50' : 'border-slate-300',
          ].join(' ')}
        />
        <button
          type="button"
          onClick={onFocus}
          className="text-slate-400 hover:text-slate-700 p-1 flex-shrink-0"
          title="Center map on this stage"
        >
          <TargetIcon />
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'REMOVE_STAGE', stageId: stage.id })}
          className="text-xs text-slate-500 hover:text-red-600 flex-shrink-0 px-1"
          aria-label="Remove stage"
        >
          ✕
        </button>
      </div>

      {duplicateName && (
        <p className="text-[11px] text-red-600">
          Duplicate name — rename to export.
        </p>
      )}

      {overlapsWith.length > 0 && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          <div className="flex items-baseline gap-1 flex-wrap">
            <span>⚠ Buffer overlaps:</span>
            {overlapsWith.map((id, i) => {
              const name = state.stages.find((s) => s.id === id)?.exportName;
              if (!name) return null;
              return (
                <span key={id} className="inline-flex items-baseline gap-0.5">
                  <button
                    type="button"
                    onClick={() => onFocusStage(id)}
                    className="font-mono underline decoration-dotted hover:text-amber-900"
                    title={`Center map on ${name}`}
                  >
                    {name}
                  </button>
                  {i < overlapNames.length - 1 && (
                    <span className="text-amber-600">,</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="text-[11px] font-medium text-slate-600">
          Legs ({stage.legs.length})
        </div>
        <ul className="space-y-1">
          {stage.legs.map((leg, idx) => {
            const t = legTracks[idx];
            if (!t) return null;
            return (
              <li
                key={`${leg.trackId}:${idx}`}
                className="flex items-center gap-1 text-[11px] rounded bg-slate-50 px-1.5 py-1"
              >
                <span className="font-mono text-slate-500 w-4 text-center">
                  {idx + 1}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {t.name || '(unnamed)'}{' '}
                  <span className="text-slate-400">
                    · {t.lengthKm.toFixed(2)} km
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'TOGGLE_LEG_REVERSED',
                      stageId: stage.id,
                      legIndex: idx,
                    })
                  }
                  className={[
                    'px-1.5 py-0.5 rounded text-[10px] font-mono',
                    leg.reversed
                      ? 'bg-amber-500 text-white'
                      : 'bg-white border border-slate-300 text-slate-600',
                  ].join(' ')}
                  title="Toggle this leg's direction"
                >
                  {leg.reversed ? '↶ rev' : '↷ fwd'}
                </button>
                {stage.legs.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'REMOVE_TRACK_FROM_STAGE',
                        stageId: stage.id,
                        legIndex: idx,
                      })
                    }
                    className="text-slate-400 hover:text-red-600 px-1"
                    aria-label="Remove leg"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {unassignedTracks.length > 0 &&
          (showAddTrack ? (
            <select
              defaultValue=""
              onChange={(e) => {
                const trackId = e.target.value;
                if (!trackId) return;
                dispatch({
                  type: 'ADD_TRACK_TO_STAGE',
                  stageId: stage.id,
                  trackId,
                });
                setShowAddTrack(false);
              }}
              onBlur={() => setShowAddTrack(false)}
              className="w-full text-xs rounded border border-slate-300 px-1.5 py-1"
              autoFocus
            >
              <option value="">— pick a track to append —</option>
              {unassignedTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || '(unnamed)'} ({t.lengthKm.toFixed(2)} km)
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddTrack(true)}
              className="w-full text-[11px] text-slate-600 hover:text-slate-900 rounded border border-dashed border-slate-300 px-1.5 py-1 hover:border-slate-500"
            >
              + Add another track to this stage
            </button>
          ))}
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'REVERSE_STAGE', stageId: stage.id })
          }
          className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 hover:bg-slate-200"
        >
          ⇄ Reverse stage
        </button>
        {(stage.cropStart > 0 || stage.cropEnd < 1) && (
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'SET_CROP',
                stageId: stage.id,
                cropStart: 0,
                cropEnd: 1,
              })
            }
            className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 hover:bg-slate-200"
            title="Reset crop"
          >
            ↺ uncrop
          </button>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-medium text-slate-600">
          Crop ({(stage.cropStart * 100).toFixed(1)}%–
          {(stage.cropEnd * 100).toFixed(1)}%)
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500 w-10">start</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={stage.cropStart}
              onChange={(e) =>
                dispatch({
                  type: 'SET_CROP',
                  stageId: stage.id,
                  cropStart: Number(e.target.value),
                })
              }
              className="flex-1"
            />
            <button
              type="button"
              onClick={() =>
                setCropMode(
                  isCroppingStart
                    ? null
                    : { stageId: stage.id, edge: 'start' },
                )
              }
              className={[
                'px-1.5 py-0.5 rounded text-[10px]',
                isCroppingStart
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-slate-300 hover:border-green-500',
              ].join(' ')}
              title="Click on map to set start"
            >
              {isCroppingStart ? 'click map…' : '⌖ map'}
            </button>
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500 w-10">end</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={stage.cropEnd}
              onChange={(e) =>
                dispatch({
                  type: 'SET_CROP',
                  stageId: stage.id,
                  cropEnd: Number(e.target.value),
                })
              }
              className="flex-1"
            />
            <button
              type="button"
              onClick={() =>
                setCropMode(
                  isCroppingEnd ? null : { stageId: stage.id, edge: 'end' },
                )
              }
              className={[
                'px-1.5 py-0.5 rounded text-[10px]',
                isCroppingEnd
                  ? 'bg-red-600 text-white'
                  : 'bg-white border border-slate-300 hover:border-red-500',
              ].join(' ')}
              title="Click on map to set end"
            >
              {isCroppingEnd ? 'click map…' : '⌖ map'}
            </button>
          </label>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] font-mono">
        <dt className="text-slate-500">length</dt>
        <dd>{Math.round(lengthKm * 1000)} m</dd>
        {ends && (
          <>
            <dt className="text-slate-500">start</dt>
            <dd className="truncate">{formatCoord(ends.start)}</dd>
            <dt className="text-slate-500">end</dt>
            <dd className="truncate">{formatCoord(ends.end)}</dd>
          </>
        )}
      </dl>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-600">buffer</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            step={1}
            value={stage.bufferRadiusM}
            onChange={(e) =>
              dispatch({
                type: 'SET_STAGE_BUFFER',
                stageId: stage.id,
                bufferRadiusM: Math.max(1, Number(e.target.value) || 30),
              })
            }
            className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right font-mono"
          />
          <span className="text-slate-500">m</span>
        </span>
      </label>

      {/* Pre-start TC callout */}
      {preStartTc && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 flex items-center gap-1.5">
          <span className="font-semibold text-amber-600">TC</span>
          <span>
            Pre-start TC: <span className="font-medium">{preStartTc.name || '(unnamed)'}</span>
          </span>
        </div>
      )}

      {/* C25 — required point checklist */}
      {(() => {
        const missing = REQUIRED_STAGE_CATEGORIES.filter(
          (c) => (categoryCounts.get(c) ?? 0) === 0,
        );
        if (missing.length === 0) return null;
        return (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800 space-y-0.5">
            <div className="font-semibold">Missing required controls:</div>
            {missing.map((c) => (
              <div key={c} className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-semibold"
                  style={{ background: CATEGORY_META[c].color, color: CATEGORY_META[c].textOnColor }}
                >
                  {CATEGORY_META[c].glyph}
                </span>
                <span>{CATEGORY_META[c].label} — assign a point with this category to this stage</span>
              </div>
            ))}
            <div className="text-red-600 mt-1">
              Use the Points list to set a category override and stage assignment, or classify a point on import.
            </div>
          </div>
        );
      })()}

      <div className="text-[11px] text-slate-600 flex items-center gap-1 flex-wrap">
        <span className="text-slate-500">points:</span>
        {assignedPoints.length === 0 ? (
          <span className="text-slate-400 italic">none</span>
        ) : (
          CATEGORY_ORDER.filter((c) => (categoryCounts.get(c) ?? 0) > 0).map(
            (c) => (
              <span
                key={c}
                className="inline-flex items-center gap-0.5 rounded px-1 py-0.5"
                style={{
                  background: CATEGORY_META[c].color,
                  color: CATEGORY_META[c].textOnColor,
                }}
                title={CATEGORY_META[c].label}
              >
                <span aria-hidden>{CATEGORY_META[c].glyph}</span>
                <span>{categoryCounts.get(c)}</span>
              </span>
            ),
          )
        )}
      </div>
    </div>
  );
}
