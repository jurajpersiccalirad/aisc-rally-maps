import { useCallback, useEffect, useState } from 'react';
import type { Schema } from '../../../amplify/data/resource';
import { getClient } from '../../lib/amplify-client';

type FeedbackRow = Schema['Feedback']['type'];

const CATEGORY_COLOR = {
  BUG: 'bg-red-100 text-red-700',
  FEATURE: 'bg-blue-100 text-blue-700',
  OTHER: 'bg-slate-100 text-slate-600',
};

export function AdminFeedbackList() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getClient();
      const { data } = await client.models.Feedback.list({ limit: 500 });
      data.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this feedback entry?')) return;
    setBusyId(id);
    try {
      const client = getClient();
      await client.models.Feedback.delete({ id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const bugCount = items.filter((i) => i.category === 'BUG').length;
  const featureCount = items.filter((i) => i.category === 'FEATURE').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Feedback</h2>
          {items.length > 0 && (
            <div className="flex gap-1 text-[11px]">
              {bugCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">{bugCount} bug{bugCount !== 1 ? 's' : ''}</span>
              )}
              {featureCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{featureCount} feature{featureCount !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </div>
        <button type="button" onClick={() => void load()}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No feedback submitted yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="border border-slate-200 rounded bg-white px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${CATEGORY_COLOR[item.category ?? 'OTHER']}`}>
                    {item.category ?? 'OTHER'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {item.userEmail ?? item.userId} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void handleDelete(item.id)}
                  className="text-[11px] text-slate-400 hover:text-red-600 px-1"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{item.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
