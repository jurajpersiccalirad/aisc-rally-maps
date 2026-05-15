import saveAs from 'file-saver';
import { useRef, useState } from 'react';
import {
  deserializeProject,
  projectJsonFilename,
  serializeProject,
} from '../export/projectJson';
import { useProject, useProjectDispatch } from '../state/useProject';

export function SaveLoadButtons() {
  const state = useProject();
  const dispatch = useProjectDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const canSave = state.sourceFiles.length > 0;

  const handleSave = () => {
    const json = serializeProject(state);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, projectJsonFilename(state.eventName));
  };

  const handleLoad = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setError(null);
    try {
      const text = await file.text();
      const loaded = deserializeProject(text);
      dispatch({ type: 'LOAD_PROJECT_JSON', state: loaded });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="text-xs px-2 py-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Save the current editing session as a JSON file"
      >
        Save project
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-xs px-2 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
        title="Load a previously saved project JSON"
      >
        Load project
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.aiscproj.json,application/json"
        className="hidden"
        onChange={(e) => void handleLoad(e.target.files)}
      />
      {error && (
        <span className="text-[11px] text-red-600 ml-1" title={error}>
          load failed
        </span>
      )}
    </div>
  );
}
