import { useMemo } from 'react';
import { CATEGORY_META, CATEGORY_ORDER } from '../classify/categoryMeta';
import { pointInMultiPoly } from '../geometry/pointInMultiPoly';
import { formatCoord } from '../lib/formatCoord';
import {
  effectiveCategory,
  getEffectivePointStages,
} from '../state/selectors';
import { useStageGeometry } from '../state/useStageGeometry';
import { useProject, useProjectDispatch } from '../state/useProject';
import type { ParsedPoint, PointCategory } from '../types';
import { EyeIcon, EyeOffIcon, TargetIcon } from './icons';
import { PointCategoryBadge } from './PointCategoryBadge';
import type { CoordFormat, Visibility, VisibilityActions } from './workspaceTypes';

interface Props {
  visibility: Visibility;
  visibilityActions: VisibilityActions;
  onFocusPoint: (pointId: string) => void;
}

export function PointList({
  visibility,
  visibilityActions,
  onFocusPoint,
}: Props) {
  const state = useProject();
  const dispatch = useProjectDispatch();
  const geometry = useStageGeometry();
  const stageMap = useMemo(() => getEffectivePointStages(state), [state]);

  const grouped = useMemo(() => {
    const m = new Map<PointCategory, ParsedPoint[]>();
    for (const p of state.points) {
      const cat = effectiveCategory(p);
      const list = m.get(cat) ?? [];
      list.push(p);
      m.set(cat, list);
    }
    return m;
  }, [state.points]);

  if (state.points.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Points ({state.points.length})
        </h3>
        <div className="flex items-center gap-1">
          <CoordFormatToggle format={visibility.coordFormat} onChange={visibilityActions.setCoordFormat} />
          <button
            type="button"
            onClick={() => {
              const assignments: Record<string, string> = {};
              for (const p of state.points) {
                if (p.stageOverride !== undefined) continue;
                for (const [stageId, mp] of geometry.buffered) {
                  if (pointInMultiPoly(p.coord, mp)) {
                    assignments[p.id] = stageId;
                    break;
                  }
                }
              }
              dispatch({ type: 'RECLASSIFY_ALL_POINTS', geoAssignments: assignments });
            }}
            className="text-[11px] px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-600"
            title="Re-run auto-classification. Points inside a stage buffer are auto-assigned to that stage (unless manually overridden)."
          >
            Re-classify
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {CATEGORY_ORDER.map((cat) => {
          const list = grouped.get(cat);
          if (!list || list.length === 0) return null;
          const hidden = visibility.hiddenCategories.has(cat);
          return (
            <details
              key={cat}
              className={[
                'rounded border',
                hidden
                  ? 'border-slate-200 bg-slate-100 opacity-60'
                  : 'border-slate-200 bg-white',
              ].join(' ')}
              open={cat !== 'other' && !hidden}
            >
              <summary className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    visibilityActions.toggleCategory(cat);
                  }}
                  className="text-slate-500 hover:text-slate-900 p-0.5"
                  title={hidden ? 'Show on map' : 'Hide from map'}
                >
                  {hidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>
                <PointCategoryBadge category={cat} />
                <span className="text-xs text-slate-500">{list.length}</span>
              </summary>
              <ul className="px-2 pb-2 space-y-1.5 border-t border-slate-100 pt-2">
                {list.map((p) => (
                  <li key={p.id} className="space-y-1">
                    <div className="flex items-start gap-1 group">
                      <button
                        type="button"
                        onClick={() => visibilityActions.togglePoint(p.id)}
                        className="text-slate-400 hover:text-slate-700 p-0.5 flex-shrink-0 mt-0.5"
                        title={visibility.hiddenPointIds.has(p.id) ? 'Show on map' : 'Hide from map'}
                      >
                        {visibility.hiddenPointIds.has(p.id) ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onFocusPoint(p.id)}
                        className="flex-1 min-w-0 text-left hover:underline"
                        title="Center map on this point"
                      >
                        <div className={[
                          'text-xs font-medium truncate',
                          visibility.hiddenPointIds.has(p.id) ? 'text-slate-400' : '',
                        ].join(' ')}>
                          {p.name || p.description || '(unnamed)'}
                          {p.sourceFileId === '__manual__' && (
                            <span className="ml-1 text-[9px] text-violet-500 font-normal">manual</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          {formatCoord(p.coord[0], p.coord[1], visibility.coordFormat)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onFocusPoint(p.id)}
                        className="text-slate-400 hover:text-slate-700 p-0.5 flex-shrink-0"
                        title="Center map"
                      >
                        <TargetIcon />
                      </button>
                      {p.sourceFileId === '__manual__' && (
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'REMOVE_MANUAL_POINT', pointId: p.id })}
                          className="text-slate-300 hover:text-red-500 text-sm leading-none p-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove manual point"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px]">
                      <select
                        value={p.categoryOverride ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'OVERRIDE_POINT_CATEGORY',
                            pointId: p.id,
                            category:
                              e.target.value === ''
                                ? undefined
                                : (e.target.value as PointCategory),
                          })
                        }
                        className="rounded border border-slate-300 bg-white px-1 py-0.5 flex-1 min-w-0"
                        title="Category override"
                      >
                        <option value="">
                          (auto: {CATEGORY_META[p.category].label})
                        </option>
                        {CATEGORY_ORDER.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_META[c].label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={
                          p.stageOverride === undefined
                            ? 'auto'
                            : p.stageOverride === null
                              ? 'none'
                              : p.stageOverride
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          dispatch({
                            type: 'OVERRIDE_POINT_STAGE',
                            pointId: p.id,
                            stageId:
                              v === 'auto'
                                ? undefined
                                : v === 'none'
                                  ? null
                                  : v,
                          });
                        }}
                        className="rounded border border-slate-300 bg-white px-1 py-0.5 flex-1 min-w-0"
                        title="Stage assignment"
                      >
                        <option value="auto">
                          (auto:{' '}
                          {(() => {
                            const sid = stageMap.get(p.id);
                            if (!sid) return 'none';
                            return (
                              state.stages.find((s) => s.id === sid)
                                ?.exportName ?? 'none'
                            );
                          })()}
                          )
                        </option>
                        <option value="none">— none —</option>
                        {state.stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.exportName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}

const FORMATS: { value: CoordFormat; label: string; title: string }[] = [
  { value: 'decimal', label: 'Dec', title: 'Decimal degrees (e.g. 60.12345°N)' },
  { value: 'dm', label: 'DM', title: "Degrees decimal minutes (e.g. 60°07.407'N)" },
  { value: 'dms', label: 'DMS', title: 'Degrees minutes seconds (e.g. 60°07\'24.5"N)' },
];

function CoordFormatToggle({ format, onChange }: { format: CoordFormat; onChange: (f: CoordFormat) => void }) {
  return (
    <div className="flex rounded border border-slate-300 overflow-hidden text-[10px]">
      {FORMATS.map((f) => (
        <button
          key={f.value}
          type="button"
          title={f.title}
          onClick={() => onChange(f.value)}
          className={[
            'px-1.5 py-0.5',
            format === f.value
              ? 'bg-slate-700 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
