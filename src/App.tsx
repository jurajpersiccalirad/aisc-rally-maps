import { useCallback, useState } from 'react';
import { ProjectProvider } from './state/ProjectContext';
import { useAuth } from './state/authStore';
import { useProject } from './state/useProject';
import type { PointCategory } from './types';
import { DropZone } from './ui/DropZone';
import { EventNameInput } from './ui/EventNameInput';
import { ExportButton } from './ui/ExportButton';
import { MapView } from './ui/MapView';
import { PointList } from './ui/PointList';
import { PublishButton } from './ui/PublishButton';
import { SaveLoadButtons } from './ui/SaveLoadButtons';
import { StagesPanel } from './ui/StagesPanel';
import { TrackList } from './ui/TrackList';
import { AdminPage } from './ui/admin/AdminPage';
import { RequireAuth } from './ui/auth/RequireAuth';
import { UserBadge } from './ui/auth/UserBadge';
import type {
  CropMode,
  FocusTarget,
  HoverState,
  Visibility,
  VisibilityActions,
} from './ui/workspaceTypes';

function Workspace() {
  const state = useProject();
  const hasFile = state.sourceFiles.length > 0;

  const [hover, setHover] = useState<HoverState | null>(null);
  const [cropMode, setCropMode] = useState<CropMode>(null);
  const [hiddenStageIds, setHiddenStageIds] = useState<Set<string>>(new Set());
  const [hiddenTrackIds, setHiddenTrackIds] = useState<Set<string>>(new Set());
  const [hiddenCategories, setHiddenCategories] = useState<Set<PointCategory>>(
    new Set(),
  );
  const [showBuffers, setShowBuffers] = useState(true);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);

  const visibility: Visibility = {
    hiddenStageIds,
    hiddenTrackIds,
    hiddenCategories,
    showBuffers,
  };

  const toggleSet = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>) =>
      (item: T) =>
        setter((prev) => {
          const next = new Set(prev);
          if (next.has(item)) next.delete(item);
          else next.add(item);
          return next;
        }),
    [],
  );

  const visibilityActions: VisibilityActions = {
    toggleStage: toggleSet(setHiddenStageIds),
    toggleTrack: toggleSet(setHiddenTrackIds),
    toggleCategory: toggleSet(setHiddenCategories),
    toggleBuffers: () => setShowBuffers((v) => !v),
    showAll: () => {
      setHiddenStageIds(new Set());
      setHiddenTrackIds(new Set());
      setHiddenCategories(new Set());
    },
  };

  const focusTrack = (trackId: string) =>
    setFocusTarget({ kind: 'track', trackId, nonce: Date.now() });
  const focusStage = (stageId: string) =>
    setFocusTarget({ kind: 'stage', stageId, nonce: Date.now() });
  const focusPoint = (pointId: string) =>
    setFocusTarget({ kind: 'point', pointId, nonce: Date.now() });

  if (!hasFile) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <DropZone />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex min-h-0">
      <aside className="w-[440px] flex-shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto p-4 space-y-4">
        <DropZone compact />
        <EventNameInput />
        <TrackList
          setHover={setHover}
          visibility={visibility}
          visibilityActions={visibilityActions}
          onFocusTrack={focusTrack}
        />
        <StagesPanel
          setHover={setHover}
          cropMode={cropMode}
          setCropMode={setCropMode}
          visibility={visibility}
          visibilityActions={visibilityActions}
          onFocusStage={focusStage}
        />
        <PointList
          visibility={visibility}
          visibilityActions={visibilityActions}
          onFocusPoint={focusPoint}
        />
      </aside>
      <section className="flex-1 relative min-w-0">
        <MapView
          hover={hover}
          setHover={setHover}
          cropMode={cropMode}
          setCropMode={setCropMode}
          visibility={visibility}
          focusTarget={focusTarget}
        />
      </section>
    </main>
  );
}

function Shell() {
  const { user } = useAuth();
  const [adminOpen, setAdminOpen] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="h-screen flex flex-col">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            AISC Rally Maps
          </h1>
          <span className="text-[11px] text-slate-500">
            KMZ / KML / GPX → Calirad AISC
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!adminOpen && <PublishButton />}
          {!adminOpen && <SaveLoadButtons />}
          {!adminOpen && <ExportButton />}
          {isAdmin && !adminOpen && (
            <button
              type="button"
              onClick={() => setAdminOpen(true)}
              className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700"
            >
              Admin
            </button>
          )}
          <UserBadge />
        </div>
      </header>

      {adminOpen ? <AdminPage onClose={() => setAdminOpen(false)} /> : <Workspace />}

      <footer className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-2 text-xs text-slate-500 flex justify-between">
        <span>build {__BUILD_HASH__}</span>
        <span>
          <a
            href="https://github.com/jurajpersiccalirad/aisc-rally-maps"
            className="hover:underline"
          >
            github
          </a>
        </span>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <ProjectProvider>
      <RequireAuth>
        <Shell />
      </RequireAuth>
    </ProjectProvider>
  );
}
