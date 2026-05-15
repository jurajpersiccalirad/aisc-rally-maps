import { useMemo, useState } from 'react';
import { getStagedTrackIds } from '../state/selectors';
import { useProject, useProjectDispatch } from '../state/useProject';
import { EyeIcon, EyeOffIcon, TargetIcon } from './icons';
import type {
  HoverState,
  Visibility,
  VisibilityActions,
} from './workspaceTypes';

interface Props {
  setHover: (h: HoverState | null) => void;
  visibility: Visibility;
  visibilityActions: VisibilityActions;
  onFocusTrack: (trackId: string) => void;
}

export function TrackList({
  setHover,
  visibility,
  visibilityActions,
  onFocusTrack,
}: Props) {
  const state = useProject();
  const dispatch = useProjectDispatch();

  const stagedIds = useMemo(() => getStagedTrackIds(state), [state]);
  const unassigned = state.tracks.filter((t) => !stagedIds.has(t.id));

  const [appendMenuFor, setAppendMenuFor] = useState<string | null>(null);

  if (state.tracks.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Tracks ({unassigned.length} unassigned)
        </h3>
        {unassigned.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_ALL_TRACKS_AS_STAGES' })}
            className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-700"
          >
            Add all as stages
          </button>
        )}
      </div>
      {unassigned.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          All tracks are assigned to a stage.
        </p>
      ) : (
        <ul className="space-y-1">
          {unassigned.map((t) => {
            const hidden = visibility.hiddenTrackIds.has(t.id);
            return (
              <li
                key={t.id}
                onMouseEnter={() =>
                  setHover({ kind: 'track', trackId: t.id })
                }
                onMouseLeave={() => setHover(null)}
                className={[
                  'rounded border px-2 py-1.5',
                  hidden
                    ? 'border-slate-200 bg-slate-100 opacity-60'
                    : 'border-slate-200 bg-white hover:border-slate-400',
                ].join(' ')}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => visibilityActions.toggleTrack(t.id)}
                    className="text-slate-500 hover:text-slate-900 p-0.5 flex-shrink-0"
                    title={hidden ? 'Show on map' : 'Hide from map'}
                  >
                    {hidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                  {t.styleColorHex && (
                    <span
                      className="inline-block w-3 h-3 rounded-sm border border-slate-300 flex-shrink-0"
                      style={{ backgroundColor: t.styleColorHex }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onFocusTrack(t.id)}
                    className="flex-1 min-w-0 text-left hover:underline"
                    title="Center map on this track"
                  >
                    <div className="text-sm font-medium truncate">
                      {t.name || '(unnamed)'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {t.folderPath.join(' › ') || '—'} ·{' '}
                      {t.lengthKm.toFixed(2)} km
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onFocusTrack(t.id)}
                    className="text-slate-400 hover:text-slate-700 p-0.5 flex-shrink-0"
                    title="Center map"
                  >
                    <TargetIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'ADD_STAGE', trackId: t.id })
                    }
                    className="text-xs px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 flex-shrink-0"
                  >
                    Add
                  </button>
                  {state.stages.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAppendMenuFor(
                          appendMenuFor === t.id ? null : t.id,
                        )
                      }
                      className="text-xs px-1.5 py-1 rounded border border-slate-300 hover:border-slate-500 flex-shrink-0"
                      title="Append to an existing stage"
                    >
                      +›
                    </button>
                  )}
                </div>
                {appendMenuFor === t.id && state.stages.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const stageId = e.target.value;
                      if (!stageId) return;
                      dispatch({
                        type: 'ADD_TRACK_TO_STAGE',
                        stageId,
                        trackId: t.id,
                      });
                      setAppendMenuFor(null);
                    }}
                    onBlur={() => setAppendMenuFor(null)}
                    className="mt-1 w-full text-xs rounded border border-slate-300 px-1.5 py-1"
                    autoFocus
                  >
                    <option value="">— append to stage —</option>
                    {state.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.exportName}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
