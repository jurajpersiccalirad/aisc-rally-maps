import { useMemo, useState } from 'react';
import { downloadExportZip, planExport } from '../export/buildZip';
import { useProject } from '../state/useProject';
import { useStageGeometry } from '../state/useStageGeometry';

interface Props {
  onClose: () => void;
}

export function ExportPreview({ onClose }: Props) {
  const state = useProject();
  const geometry = useStageGeometry();
  const plan = useMemo(
    () => planExport(state, geometry),
    [state, geometry],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadExportZip(state, geometry);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canDownload = plan.errors.length === 0 && !busy;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Export preview</h2>
            <p className="text-xs text-slate-500 font-mono">{plan.filename}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 px-2 py-1 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
          {plan.errors.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800 space-y-1">
              {plan.errors.map((e, i) => (
                <div key={i}>✗ {e}</div>
              ))}
            </div>
          )}

          {plan.warnings.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 space-y-1">
              {plan.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Files ({plan.paths.length})
            </h3>
            <ul className="font-mono text-xs space-y-0.5 max-h-64 overflow-y-auto rounded border border-slate-200 p-2 bg-slate-50">
              {plan.paths.map((p) => (
                <li key={p} className="text-slate-700">
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!canDownload}
            className="px-3 py-1.5 text-sm rounded bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {busy ? 'Building…' : 'Download ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
