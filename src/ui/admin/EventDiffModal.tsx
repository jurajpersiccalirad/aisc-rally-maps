import { getUrl } from 'aws-amplify/storage';
import { useEffect, useState } from 'react';
import type { Schema } from '../../../amplify/data/resource';
import { deserializeProject } from '../../export/projectJson';
import type { ProjectState, Stage } from '../../types';

type EventRow = Schema['Event']['type'];

interface Props {
  eventA: EventRow;
  eventB: EventRow;
  onClose: () => void;
}

interface LoadedPair {
  a: ProjectState | null;
  b: ProjectState | null;
  error: string | null;
}

async function fetchProject(key: string | null | undefined): Promise<ProjectState | null> {
  if (!key) return null;
  const { url } = await getUrl({ path: key, options: { expiresIn: 300 } });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`S3 fetch ${res.status}`);
  return deserializeProject(await res.text());
}

function stageKey(s: Stage) { return s.exportName; }

function StageDiff({ a, b }: { a: ProjectState; b: ProjectState }) {
  const namesA = new Set(a.stages.map(stageKey));
  const namesB = new Set(b.stages.map(stageKey));
  const all = [...new Set([...namesA, ...namesB])].sort();

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="pb-1 font-medium pr-3">Stage</th>
          <th className="pb-1 font-medium pr-3">A buffer</th>
          <th className="pb-1 font-medium pr-3">B buffer</th>
          <th className="pb-1 font-medium">Changed</th>
        </tr>
      </thead>
      <tbody>
        {all.map((name) => {
          const sa = a.stages.find((s) => s.exportName === name);
          const sb = b.stages.find((s) => s.exportName === name);
          const added = !sa && !!sb;
          const removed = !!sa && !sb;
          const bufferChanged = sa && sb && sa.bufferRadiusM !== sb.bufferRadiusM;
          const cropChanged = sa && sb && (sa.cropStart !== sb.cropStart || sa.cropEnd !== sb.cropEnd);
          const rowClass = added ? 'text-emerald-700 bg-emerald-50' : removed ? 'text-red-700 bg-red-50 line-through' : '';
          return (
            <tr key={name} className={rowClass}>
              <td className="py-0.5 pr-3 font-mono">{name}</td>
              <td className="py-0.5 pr-3">{sa ? `${sa.bufferRadiusM}m` : '—'}</td>
              <td className="py-0.5 pr-3">{sb ? `${sb.bufferRadiusM}m` : '—'}</td>
              <td className="py-0.5">
                {added && <span className="text-emerald-700 font-medium">+added</span>}
                {removed && <span className="text-red-700 font-medium">−removed</span>}
                {bufferChanged && <span className="text-amber-700">buffer</span>}
                {cropChanged && <span className="text-amber-700 ml-1">crop</span>}
                {!added && !removed && !bufferChanged && !cropChanged && (
                  <span className="text-slate-400">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function EventDiffModal({ eventA, eventB, onClose }: Props) {
  const [pair, setPair] = useState<LoadedPair>({ a: null, b: null, error: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchProject(eventA.projectJsonKey),
      fetchProject(eventB.projectJsonKey),
    ])
      .then(([a, b]) => { setPair({ a, b, error: null }); })
      .catch((e: unknown) => { setPair({ a: null, b: null, error: String(e) }); })
      .finally(() => setLoading(false));
  }, [eventA.projectJsonKey, eventB.projectJsonKey]);

  const label = (row: EventRow) =>
    [row.eventName, row.version].filter(Boolean).join(' · ') || row.id.slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold">Compare events</h2>
          <button type="button" onClick={onClose}
            className="text-slate-500 hover:text-slate-900 px-2 text-xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm">
          {/* Event headers */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {([eventA, eventB] as const).map((row, i) => (
              <div key={row.id} className={`rounded border p-2 ${i === 0 ? 'border-blue-200 bg-blue-50' : 'border-purple-200 bg-purple-50'}`}>
                <div className="font-semibold">{i === 0 ? 'A' : 'B'}: {label(row)}</div>
                <div className="text-slate-500">{row.ownerEmail} · {row.stageCount ?? 0} stages · {row.trackCount ?? 0} tracks</div>
                <div className={`text-[10px] font-semibold mt-0.5 ${row.status === 'PUBLISHED' ? 'text-emerald-700' : row.status === 'SUBMITTED' ? 'text-blue-700' : 'text-slate-600'}`}>
                  {row.status}
                </div>
              </div>
            ))}
          </div>

          {loading && <p className="text-slate-500">Loading project files…</p>}

          {pair.error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{pair.error}</div>
          )}

          {pair.a && pair.b && (
            <>
              {/* Summary counts */}
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                {[
                  { label: 'Stages', a: pair.a.stages.length, b: pair.b.stages.length },
                  { label: 'Tracks', a: pair.a.tracks.length, b: pair.b.tracks.length },
                  { label: 'Points', a: pair.a.points.length, b: pair.b.points.length },
                ].map(({ label, a, b }) => (
                  <div key={label} className="rounded border border-slate-200 p-2">
                    <div className="text-slate-500">{label}</div>
                    <div className="font-mono">
                      <span className="text-blue-700">{a}</span>
                      {' → '}
                      <span className={a === b ? 'text-slate-700' : b > a ? 'text-emerald-700' : 'text-red-700'}>{b}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stage diff table */}
              <div>
                <h3 className="text-xs font-semibold text-slate-600 mb-2">Stage details</h3>
                <StageDiff a={pair.a} b={pair.b} />
              </div>

              {/* Default buffer */}
              {pair.a.bufferRadiusDefault !== pair.b.bufferRadiusDefault && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                  Default buffer changed: {pair.a.bufferRadiusDefault}m → {pair.b.bufferRadiusDefault}m
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
