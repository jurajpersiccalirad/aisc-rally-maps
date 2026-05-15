import { useMemo } from 'react';
import { useProject } from '../state/useProject';
import { useStageGeometry } from '../state/useStageGeometry';
import { StageCard } from './StageCard';
import type {
  CropMode,
  HoverState,
  Visibility,
  VisibilityActions,
} from './workspaceTypes';

interface Props {
  setHover: (h: HoverState | null) => void;
  cropMode: CropMode;
  setCropMode: (m: CropMode) => void;
  visibility: Visibility;
  visibilityActions: VisibilityActions;
  onFocusStage: (stageId: string) => void;
}

export function StagesPanel({
  setHover,
  cropMode,
  setCropMode,
  visibility,
  visibilityActions,
  onFocusStage,
}: Props) {
  const { stages } = useProject();
  const geometry = useStageGeometry();

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stages) {
      counts.set(s.exportName, (counts.get(s.exportName) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, n]) => n > 1)
        .map(([name]) => name),
    );
  }, [stages]);

  if (stages.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Stages ({stages.length})
        </h3>
        <button
          type="button"
          onClick={visibilityActions.toggleBuffers}
          className={[
            'text-[11px] px-2 py-0.5 rounded',
            visibility.showBuffers
              ? 'bg-slate-900 text-white'
              : 'bg-slate-200 text-slate-600',
          ].join(' ')}
          title="Toggle buffer overlay visibility"
        >
          buffer overlay {visibility.showBuffers ? 'on' : 'off'}
        </button>
      </div>
      <div className="space-y-2">
        {stages.map((s) => (
          <StageCard
            key={s.id}
            stage={s}
            duplicateName={duplicateNames.has(s.exportName)}
            setHover={setHover}
            cropMode={cropMode}
            setCropMode={setCropMode}
            hidden={visibility.hiddenStageIds.has(s.id)}
            onToggleVisible={() => visibilityActions.toggleStage(s.id)}
            onFocus={() => onFocusStage(s.id)}
            overlapsWith={geometry.overlapsFor.get(s.id) ?? []}
            onFocusStage={onFocusStage}
          />
        ))}
      </div>
    </div>
  );
}
