import { getUrl } from 'aws-amplify/storage';
import { useCallback, useEffect, useState } from 'react';
import type { Schema } from '../../amplify/data/resource';
import { getClient } from '../lib/amplify-client';
import { useAuth } from '../state/authStore';

type EventRow = Schema['Event']['type'];
type Status = NonNullable<EventRow['status']>;

const STATUS_COLOR: Record<Status, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export function UserEventList({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const client = getClient();
      const { data } = await client.models.Event.list({
        filter: { ownerId: { eq: user.userId } },
        limit: 200,
      });
      data.sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      );
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const downloadZip = async (key: string | null | undefined) => {
    if (!key) return;
    try {
      const { url } = await getUrl({ path: key, options: { expiresIn: 300 } });
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">My submissions</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            ← Back to editor
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-3">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              No submissions yet. Use "Send for publishing" or "Publish event" to submit your first event.
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((row) => {
                const status = (row.status ?? 'DRAFT') as Status;
                return (
                  <li
                    key={row.id}
                    className="border border-slate-200 rounded bg-white px-4 py-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {row.eventName}
                          {row.version && (
                            <span className="ml-2 text-[11px] font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {row.version}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {row.stageCount ?? 0} stages · {row.trackCount ?? 0} tracks ·{' '}
                          {row.submittedAt
                            ? `Submitted ${new Date(row.submittedAt).toLocaleDateString()}`
                            : row.createdAt
                              ? `Created ${new Date(row.createdAt).toLocaleDateString()}`
                              : '—'}
                          {row.publishedAt
                            ? ` · Published ${new Date(row.publishedAt).toLocaleDateString()}`
                            : null}
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_COLOR[status]}`}
                      >
                        {status}
                      </span>
                    </div>

                    {status === 'REJECTED' && row.reviewNote && (
                      <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        <span className="font-semibold">Rejection note: </span>
                        {row.reviewNote}
                      </div>
                    )}

                    {status === 'PUBLISHED' && row.exportZipKey && (
                      <button
                        type="button"
                        onClick={() => void downloadZip(row.exportZipKey)}
                        className="text-xs px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Download approved ZIP
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
