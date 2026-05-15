import { useState } from 'react';
import { useProject } from '../state/useProject';
import { ExportPreview } from './ExportPreview';

export function ExportButton() {
  const state = useProject();
  const [open, setOpen] = useState(false);
  const disabled = state.sourceFiles.length === 0 || state.stages.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-xs px-3 py-1.5 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
        title={
          disabled ? 'Add at least one stage first' : 'Export AISC ZIP'
        }
      >
        Export AISC ZIP
      </button>
      {open && <ExportPreview onClose={() => setOpen(false)} />}
    </>
  );
}
