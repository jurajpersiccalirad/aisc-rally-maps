import { useRef, useState } from 'react';
import { readUploadedFile } from '../parse/readUploadedFile';
import { useProjectDispatch } from '../state/useProject';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; filename: string }
  | { kind: 'error'; message: string };

export function DropZone({ compact = false }: { compact?: boolean }) {
  const dispatch = useProjectDispatch();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setStatus({ kind: 'loading', filename: file.name });
    try {
      const result = await readUploadedFile(file);
      dispatch({ type: 'LOAD_SOURCE_FILE', result });
      setStatus({ kind: 'idle' });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
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
          <p className="text-slate-600">Loading {status.filename}…</p>
        ) : (
          <>
            <p className="text-slate-700 font-medium">
              Drop a KMZ / KML / GPX file, or click to pick
            </p>
            {!compact && (
              <p className="text-slate-500 text-sm mt-2">
                Files stay on this machine — nothing is uploaded.
              </p>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".kmz,.kml,.gpx"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
      {status.kind === 'error' && (
        <p className="mt-2 text-sm text-red-600">{status.message}</p>
      )}
    </div>
  );
}
