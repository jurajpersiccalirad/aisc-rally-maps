import { useState } from 'react';
import { clearAutoSave, loadAutoSave } from '../state/useAutoSave';
import { useProjectDispatch } from '../state/useProject';

export function RestoreBanner() {
  const dispatch = useProjectDispatch();
  const [snap] = useState(() => loadAutoSave());
  const [dismissed, setDismissed] = useState(false);

  if (!snap || dismissed) return null;

  const label = [
    snap.state.eventName ? `"${snap.state.eventName}"` : 'unnamed project',
    snap.state.stages.length > 0 ? `${snap.state.stages.length} stage${snap.state.stages.length !== 1 ? 's' : ''}` : null,
    snap.state.sourceFiles.length > 0 ? `${snap.state.sourceFiles.length} file${snap.state.sourceFiles.length !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(', ');

  const when = new Date(snap.savedAt).toLocaleString();

  const restore = () => {
    dispatch({ type: 'LOAD_PROJECT_JSON', state: snap.state });
    clearAutoSave();
    setDismissed(true);
  };

  const discard = () => {
    clearAutoSave();
    setDismissed(true);
  };

  return (
    <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-3 text-xs">
      <span className="text-amber-800">
        Auto-saved session found: <span className="font-medium">{label}</span> from {when}
      </span>
      <button
        type="button"
        onClick={restore}
        className="px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
      >
        Restore
      </button>
      <button
        type="button"
        onClick={discard}
        className="px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-100"
      >
        Discard
      </button>
    </div>
  );
}
