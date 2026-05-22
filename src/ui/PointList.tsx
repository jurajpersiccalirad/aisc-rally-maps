import { useMemo } from 'react';
import { CATEGORY_META, CATEGORY_ORDER } from '../classify/categoryMeta';
import {
  effectiveCategory,
  getEffectivePointStages,
} from '../state/selectors';
import { useProject, useProjectDispatch } from '../state/useProject';
import type { ParsedPoint, PointCategory } from '../types';
import { EyeIcon, EyeOffIcon, TargetIcon } from './icons';
import { PointCategoryBadge } from './PointCategoryBadge';
import type { Visibility, VisibilityActions } from './workspaceTypes';

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
        <button
          type="button"
          onClick={() => dispatch({ type: 'RECLASSIFY_ALL_POINTS' })}
          className="text-[11px] px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-600"
          title="Re-run auto-classification on all points using their name/description. Does not clear manual overrides."
        >
          Re-classify
        </button>
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
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => onFocusPoint(p.id)}
                        className="flex-1 min-w-0 text-left hover:underline"
                        title="Center map on this point"
                      >
                        <div className="text-xs font-medium truncate">
                          {p.name || p.description || '(unnamed)'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          {p.coord[1].toFixed(5)},{' '}
                          {p.coord[0].toFixed(5)}
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
