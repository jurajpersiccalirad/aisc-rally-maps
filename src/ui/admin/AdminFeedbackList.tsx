import { useCallback, useEffect, useState } from 'react';
import type { Schema } from '../../../amplify/data/resource';
import { getClient } from '../../lib/amplify-client';
import { useAuth } from '../../state/authStore';
import { FeedbackThread } from '../FeedbackThread';

type FeedbackRow = Schema['Feedback']['type'];

const CATEGORY_COLOR = {
  BUG: 'bg-red-100 text-red-700',
  FEATURE: 'bg-blue-100 text-blue-700',
  OTHER: 'bg-slate-100 text-slate-600',
};

export function AdminFeedbackList() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

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

  const toggleResolve = async (item: FeedbackRow) => {
    setBusyId(item.id);
    try {
      const client = getClient();
      const nowResolved = !item.resolved;
      await client.models.Feedback.update({
        id: item.id,
        resolved: nowResolved,
        resolvedAt: nowResolved ? new Date().toISOString() : undefined,
        resolvedBy: nowResolved ? (user?.email ?? 'admin') : undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

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

  const visible = showResolved ? items : items.filter((i) => !i.resolved);
  const openCount = items.filter((i) => !i.resolved).length;
  const resolvedCount = items.filter((i) => i.resolved).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Feedback</h2>
          <div className="flex gap-1 text-[11px]">
            {openCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{openCount} open</span>
            )}
            {resolvedCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{resolvedCount} resolved</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="accent-slate-600"
            />
            Show resolved
          </label>
          <button type="button" onClick={() => void load()}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{showResolved ? 'No feedback yet.' : 'No open feedback.'}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => {
            const isExpanded = expandedId === item.id;
            const isResolved = !!item.resolved;
            return (
              <li
                key={item.id}
                className={[
                  'border rounded bg-white overflow-hidden',
                  isResolved ? 'border-slate-200 opacity-70' : 'border-slate-200',
                ].join(' ')}
              >
                {/* Header row */}
                <div className="px-4 py-3 flex items-start gap-2">
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${CATEGORY_COLOR[item.category ?? 'OTHER']}`}>
                        {item.category ?? 'OTHER'}
                      </span>
                      {isResolved && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                          ✓ Resolved{item.resolvedBy ? ` by ${item.resolvedBy}` : ''}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500">
                        {item.userEmail} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{item.text}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                    >
                      {isExpanded ? 'Hide' : 'Thread'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleDelete(item.id)}
                      className="text-[11px] text-slate-400 hover:text-red-600 px-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Thread */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                    <FeedbackThread
                      feedbackId={item.id}
                      canResolve
                      resolved={isResolved}
                      onResolveToggle={() => toggleResolve(item)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
