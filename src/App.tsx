import { useCallback, useState } from 'react';
import { ProjectProvider } from './state/ProjectContext';
import { useAuth } from './state/authStore';
import { useProject } from './state/useProject';
import { useAutoSave } from './state/useAutoSave';
import type { PointCategory } from './types';
import { DropZone } from './ui/DropZone';
import { EventNameInput } from './ui/EventNameInput';
import { ExportButton } from './ui/ExportButton';
import { MapView } from './ui/MapView';
import { PointList } from './ui/PointList';
import { PublishButton } from './ui/PublishButton';
import { FeedbackPanel } from './ui/FeedbackPanel';
import { RestoreBanner } from './ui/RestoreBanner';
import { SaveLoadButtons } from './ui/SaveLoadButtons';
import { StagesPanel } from './ui/StagesPanel';
import { TrackList } from './ui/TrackList';
import { AdminPage } from './ui/admin/AdminPage';
import { DeploymentPlanner } from './ui/DeploymentPlanner';
import { ManualEditor } from './ui/ManualEditor';
import { RallyTimeline } from './ui/RallyTimeline';
import { UserEventList } from './ui/UserEventList';
import { RequireAuth } from './ui/auth/RequireAuth';
import { UserBadge } from './ui/auth/UserBadge';
import type {
  CoordFormat,
  CropMode,
  FocusTarget,
  HoverState,
  MapEditMode,
  Visibility,
  VisibilityActions,
} from './ui/workspaceTypes';

const COORD_FORMATS: { value: CoordFormat; label: string; title: string }[] = [
  { value: 'decimal', label: 'Dec', title: 'Decimal degrees — 60.12345°N' },
  { value: 'dm', label: "D°M'", title: "Degrees decimal minutes — 60°07.407'N" },
  { value: 'dms', label: 'DMS', title: 'Degrees minutes seconds — 60°07\'24.5"N' },
];

function Workspace() {
  const state = useProject();
  const hasFile = state.sourceFiles.length > 0;

  const [hover, setHover] = useState<HoverState | null>(null);
  const [cropMode, setCropMode] = useState<CropMode>(null);
  const [mapEditMode, setMapEditMode] = useState<MapEditMode>(null);
  const [hiddenStageIds, setHiddenStageIds] = useState<Set<string>>(new Set());
  const [hiddenTrackIds, setHiddenTrackIds] = useState<Set<string>>(new Set());
  const [hiddenCategories, setHiddenCategories] = useState<Set<PointCategory>>(new Set());
  const [hiddenPointIds, setHiddenPointIds] = useState<Set<string>>(new Set());
  const [showBuffers, setShowBuffers] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [showStartMarkers, setShowStartMarkers] = useState(true);
  const [showEndMarkers, setShowEndMarkers] = useState(true);
  const [coordFormat, setCoordFormat] = useState<CoordFormat>('decimal');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);

  const visibility: Visibility = {
    hiddenStageIds,
    hiddenTrackIds,
    hiddenCategories,
    hiddenPointIds,
    showBuffers,
    showArrows,
    showStartMarkers,
    showEndMarkers,
    coordFormat,
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
    togglePoint: toggleSet(setHiddenPointIds),
    toggleBuffers: () => setShowBuffers((v) => !v),
    toggleArrows: () => setShowArrows((v) => !v),
    toggleStartMarkers: () => setShowStartMarkers((v) => !v),
    toggleEndMarkers: () => setShowEndMarkers((v) => !v),
    setCoordFormat,
    showAll: () => {
      setHiddenStageIds(new Set());
      setHiddenTrackIds(new Set());
      setHiddenCategories(new Set());
      setHiddenPointIds(new Set());
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
        <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex-shrink-0">Coords</span>
          <div className="flex rounded border border-slate-200 overflow-hidden text-[10px]">
            {COORD_FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                title={f.title}
                onClick={() => setCoordFormat(f.value)}
                className={[
                  'px-1.5 py-0.5',
                  coordFormat === f.value ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex rounded border border-slate-200 overflow-hidden text-[10px]">
            <button
              type="button"
              onClick={() => setShowArrows((v) => !v)}
              title="Toggle direction arrows along stage tracks"
              className={[
                'px-1.5 py-0.5',
                showArrows ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              arrows
            </button>
            <button
              type="button"
              onClick={() => setShowStartMarkers((v) => !v)}
              title="Toggle stage start markers"
              className={[
                'px-1.5 py-0.5 border-l border-slate-200',
                showStartMarkers ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              ▶ start
            </button>
            <button
              type="button"
              onClick={() => setShowEndMarkers((v) => !v)}
              title="Toggle stage end markers"
              className={[
                'px-1.5 py-0.5 border-l border-slate-200',
                showEndMarkers ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              ■ end
            </button>
          </div>
        </div>
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
          selectedStageId={selectedStageId}
        />
        <PointList
          visibility={visibility}
          visibilityActions={visibilityActions}
          onFocusPoint={focusPoint}
          selectedPointId={selectedPointId}
        />
        <ManualEditor mapEditMode={mapEditMode} onMapEditModeChange={setMapEditMode} />
      </aside>
      <section className="flex-1 relative min-w-0">
        <MapView
          hover={hover}
          setHover={setHover}
          cropMode={cropMode}
          setCropMode={setCropMode}
          visibility={visibility}
          focusTarget={focusTarget}
          mapEditMode={mapEditMode}
          onMapEditModeChange={setMapEditMode}
          onSelectPoint={setSelectedPointId}
          onSelectStage={setSelectedStageId}
        />
      </section>
    </main>
  );
}

type Panel = 'editor' | 'admin' | 'myevents' | 'deploy' | 'timeline' | 'feedback';

function Shell() {
  const { user } = useAuth();
  const [panel, setPanel] = useState<Panel>('editor');
  useAutoSave(useProject());
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="h-screen flex flex-col">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">AISC Rally Maps</h1>
          <span className="text-[11px] text-slate-500">KMZ / KML / GPX → Calirad AISC</span>
        </div>
        <div className="flex items-center gap-2">
          {panel === 'editor' && <PublishButton />}
          {panel === 'editor' && <SaveLoadButtons />}
          {panel === 'editor' && <ExportButton />}
          {user && panel === 'editor' && (
            <button
              type="button"
              onClick={() => setPanel('myevents')}
              className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
            >
              My Events
            </button>
          )}
          {user && panel === 'editor' && (
            <button
              type="button"
              onClick={() => setPanel('deploy')}
              className="text-xs px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              Deployment
            </button>
          )}
          {user && panel === 'editor' && (
            <button
              type="button"
              onClick={() => setPanel('timeline')}
              className="text-xs px-3 py-1.5 rounded border border-violet-300 text-violet-700 hover:bg-violet-50"
            >
              Timeline
            </button>
          )}
          {isAdmin && panel === 'editor' && (
            <button
              type="button"
              onClick={() => setPanel('admin')}
              className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700"
            >
              Admin
            </button>
          )}
          {user && panel === 'editor' && (
            <button
              type="button"
              onClick={() => setPanel('feedback')}
              className="text-xs px-2 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
            >
              Feedback
            </button>
          )}
          <UserBadge />
        </div>
      </header>

      {panel === 'editor' && <RestoreBanner />}

      {panel === 'admin' ? (
        <AdminPage onClose={() => setPanel('editor')} />
      ) : panel === 'myevents' ? (
        <UserEventList onClose={() => setPanel('editor')} />
      ) : panel === 'deploy' ? (
        <DeploymentPlanner onClose={() => setPanel('editor')} />
      ) : panel === 'timeline' ? (
        <RallyTimeline onClose={() => setPanel('editor')} />
      ) : panel === 'feedback' ? (
        <FeedbackPanel onClose={() => setPanel('editor')} />
      ) : (
        <Workspace />
      )}

      <footer className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-2 text-xs text-slate-500 flex justify-between">
        <span>build {__BUILD_HASH__}</span>
        <span>
          <a href="https://github.com/jurajpersiccalirad/aisc-rally-maps" className="hover:underline">
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
