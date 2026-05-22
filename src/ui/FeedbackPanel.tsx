import { useCallback, useEffect, useState } from 'react';
import type { Schema } from '../../amplify/data/resource';
import { getClient } from '../lib/amplify-client';
import { useAuth } from '../state/authStore';
import { FeedbackThread } from './FeedbackThread';

type FeedbackRow = Schema['Feedback']['type'];
type FeedbackCategory = 'BUG' | 'FEATURE' | 'OTHER';

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'BUG', label: 'Bug / something broken' },
  { value: 'FEATURE', label: 'Missing feature / workflow gap' },
  { value: 'OTHER', label: 'Other' },
];

const CATEGORY_COLOR = {
  BUG: 'bg-red-100 text-red-700',
  FEATURE: 'bg-blue-100 text-blue-700',
  OTHER: 'bg-slate-100 text-slate-600',
};

export function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();

  // Submit form state
  const [category, setCategory] = useState<FeedbackCategory>('FEATURE');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitDone, setSubmitDone] = useState(false);

  // My feedback list
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    if (!user) return;
    setLoadingItems(true);
    try {
      const client = getClient();
      const { data } = await client.models.Feedback.list({
        filter: { userId: { eq: user.userId } },
        limit: 100,
      });
      data.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      setItems(data);
    } catch {
      // non-critical
    } finally {
      setLoadingItems(false);
    }
  }, [user]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const client = getClient();
      await client.models.Feedback.create({
        userId: user.userId,
        userEmail: user.email,
        category,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      });
      setText('');
      setSubmitDone(true);
      await loadItems();
      setTimeout(() => setSubmitDone(false), 3000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Feedback</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
        >
          ← Back to editor
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Submit form */}
          <section className="rounded border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Submit new feedback</h3>

            {submitDone && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                ✓ Submitted — thank you. You can track it below.
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    className={[
                      'text-xs px-3 py-1.5 rounded border',
                      category === value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'border-slate-300 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                required
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                placeholder={
                  category === 'BUG'
                    ? 'What went wrong? Steps to reproduce if possible…'
                    : 'What workflow or feature is missing?'
                }
              />
              {submitError && (
                <p className="text-xs text-red-700">{submitError}</p>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !text.trim()}
                  className="text-xs px-4 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300"
                >
                  {submitting ? 'Sending…' : 'Send feedback'}
                </button>
              </div>
            </form>
          </section>

          {/* My submissions */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">
              My submissions {items.length > 0 && <span className="font-normal text-slate-400">({items.length})</span>}
            </h3>

            {loadingItems ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nothing submitted yet.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const isResolved = !!item.resolved;
                  return (
                    <li
                      key={item.id}
                      className="rounded border border-slate-200 bg-white overflow-hidden"
                    >
                      <div className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${CATEGORY_COLOR[item.category ?? 'OTHER']}`}>
                                {item.category ?? 'OTHER'}
                              </span>
                              {isResolved ? (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                                  ✓ Resolved
                                </span>
                              ) : (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                  Open
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400">
                                {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.text}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 flex-shrink-0"
                          >
                            {isExpanded ? 'Hide' : 'Thread'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                          <FeedbackThread feedbackId={item.id} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
