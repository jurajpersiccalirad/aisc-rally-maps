import { getUrl } from 'aws-amplify/storage';
import { useCallback, useEffect, useState } from 'react';
import type { Schema } from '../../../amplify/data/resource';
import { deserializeProject } from '../../export/projectJson';
import { getClient } from '../../lib/amplify-client';
import { useProjectDispatch } from '../../state/useProject';

type EventRow = Schema['Event']['type'];
type Status = NonNullable<EventRow['status']>;

const STATUS_ORDER: Status[] = ['SUBMITTED', 'PUBLISHED', 'REJECTED', 'DRAFT'];

export function AdminEventList({ onClose }: { onClose?: () => void }) {
  const dispatch = useProjectDispatch();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getClient();
      const { data } = await client.models.Event.list({ limit: 500 });
      data.sort(
        (a, b) =>
          (b.submittedAt ?? b.createdAt ?? '').localeCompare(
            a.submittedAt ?? a.createdAt ?? '',
          ),
      );
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (
    row: EventRow,
    status: Status,
    note?: string,
  ) => {
    setBusyId(row.id);
    try {
      const client = getClient();
      await client.models.Event.update({
        id: row.id,
        status,
        publishedAt:
          status === 'PUBLISHED' ? new Date().toISOString() : undefined,
        reviewNote: note,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const downloadZip = async (key: string | null | undefined) => {
    if (!key) return;
    try {
      const { url } = await getUrl({ path: key, options: { expiresIn: 300 } });
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openInEditor = async (row: EventRow) => {
    if (!row.projectJsonKey) {
      setError('No project JSON available for this event.');
      return;
    }
    setBusyId(row.id);
    try {
      const { url } = await getUrl({
        path: row.projectJsonKey,
        options: { expiresIn: 300 },
      });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to fetch project JSON: ${res.status}`);
      const text = await res.text();
      const loaded = deserializeProject(text);
      dispatch({ type: 'LOAD_PROJECT_JSON', state: loaded });
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const grouped = new Map<Status, EventRow[]>();
  for (const e of events) {
    const s = (e.status ?? 'DRAFT') as Status;
    const list = grouped.get(s) ?? [];
    list.push(e);
    grouped.set(s, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">All events</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {STATUS_ORDER.map((status) => {
            const list = grouped.get(status) ?? [];
            return (
              <div key={status}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                  {status} ({list.length})
                </h3>
                {list.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">none</p>
                ) : (
                  <ul className="space-y-1">
                    {list.map((row) => (
                      <li
                        key={row.id}
                        className="border border-slate-200 rounded bg-white px-3 py-2 text-sm flex items-center gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {row.eventName}
                            {row.version && (
                              <span className="ml-2 text-[11px] font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {row.version}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.ownerEmail} · {row.stageCount ?? 0} stages ·{' '}
                            {row.trackCount ?? 0} tracks ·{' '}
                            {row.submittedAt
                              ? new Date(row.submittedAt).toLocaleString()
                              : '—'}
                          </div>
                        </div>
                        {row.exportZipKey && (
                          <button
                            type="button"
                            onClick={() => void downloadZip(row.exportZipKey)}
                            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                          >
                            Download ZIP
                          </button>
                        )}
                        {row.projectJsonKey && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void openInEditor(row)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                            title="Load this event into the editor as a new version"
                          >
                            Open
                          </button>
                        )}
                        {status === 'SUBMITTED' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() =>
                                void updateStatus(row, 'PUBLISHED')
                              }
                              className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => {
                                const note = window.prompt(
                                  'Reason for rejection?',
                                );
                                if (note !== null)
                                  void updateStatus(row, 'REJECTED', note);
                              }}
                              className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {status === 'PUBLISHED' && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void updateStatus(row, 'SUBMITTED')}
                            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                          >
                            Unpublish
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
