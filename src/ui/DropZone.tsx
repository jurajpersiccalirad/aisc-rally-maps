import { useRef, useState } from 'react';
import { readUploadedFile } from '../parse/readUploadedFile';
import { useProject, useProjectDispatch } from '../state/useProject';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; current: string; done: number; total: number }
  | { kind: 'error'; message: string };

export function DropZone({ compact = false }: { compact?: boolean }) {
  const { sourceFiles } = useProject();
  const dispatch = useProjectDispatch();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const alreadyHasFiles = sourceFiles.length > 0;

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setStatus({ kind: 'loading', current: file.name, done: i, total: list.length });
      try {
        const result = await readUploadedFile(file);
        if (i === 0 && !alreadyHasFiles) {
          dispatch({ type: 'LOAD_SOURCE_FILE', result });
        } else {
          dispatch({ type: 'MERGE_SOURCE_FILE', result });
        }
      } catch (e) {
        setStatus({
          kind: 'error',
          message: `${file.name}: ${e instanceof Error ? e.message : String(e)}`,
        });
        return;
      }
    }
    setStatus({ kind: 'idle' });
    // Reset so the same file can be re-selected if needed
    if (inputRef.current) inputRef.current.value = '';
  }

  const sizeClasses = compact ? 'p-4 text-sm' : 'p-12';

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setHover(true);
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={[
          'border-2 border-dashed rounded-lg text-center bg-white cursor-pointer',
          'transition-colors',
          hover
            ? 'border-amber-500 bg-amber-50'
            : 'border-slate-300 hover:border-slate-400',
          sizeClasses,
        ].join(' ')}
      >
        {status.kind === 'loading' ? (
          <p className="text-slate-600">
            Loading {status.current}
            {status.total > 1 && (
              <span className="text-slate-400">
                {' '}({status.done + 1}/{status.total})
              </span>
            )}
            …
          </p>
        ) : compact ? (
          <p className="text-slate-600">
            + Add another KMZ / KML / GPX
          </p>
        ) : (
          <>
            <p className="text-slate-700 font-medium">
              Drop KMZ / KML / GPX files here, or click to pick
            </p>
            {!compact && (
              <p className="text-slate-500 text-sm mt-2">
                Multiple files supported — tracks are merged. Files stay on this machine.
              </p>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".kmz,.kml,.gpx"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
      {status.kind === 'error' && (
        <p className="mt-2 text-sm text-red-600">{status.message}</p>
      )}
      {sourceFiles.length > 1 && (
        <p className="mt-1 text-[11px] text-slate-500">
          {sourceFiles.length} files loaded: {sourceFiles.map((f) => f.name).join(', ')}
        </p>
      )}
    </div>
  );
}
