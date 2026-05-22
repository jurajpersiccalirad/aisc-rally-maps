import { useState } from 'react';
import { getClient } from '../lib/amplify-client';
import { useAuth } from '../state/authStore';

type FeedbackCategory = 'BUG' | 'FEATURE' | 'OTHER';

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'BUG', label: 'Bug / something broken' },
  { value: 'FEATURE', label: 'Missing feature / workflow gap' },
  { value: 'OTHER', label: 'Other' },
];

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('FEATURE');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      await client.models.Feedback.create({
        userId: user.userId,
        userEmail: user.email,
        category,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold">Send feedback</h2>
          <button type="button" onClick={onClose}
            className="text-slate-500 hover:text-slate-900 px-2 text-xl leading-none">×</button>
        </div>

        {done ? (
          <div className="px-4 py-6 text-center space-y-3">
            <div className="text-2xl">✓</div>
            <p className="text-sm text-slate-700 font-medium">Thank you — feedback received.</p>
            <p className="text-xs text-slate-500">It will be reviewed when planning the next roadmap iteration.</p>
            <button type="button" onClick={onClose}
              className="text-xs px-4 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="px-4 py-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Category</label>
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
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">
                {category === 'BUG'
                  ? 'What went wrong? Steps to reproduce if possible.'
                  : category === 'FEATURE'
                    ? 'What workflow or feature is missing? What would it help you do?'
                    : 'Your feedback'}
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                required
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                placeholder="Describe the issue or idea in as much detail as helpful…"
              />
            </div>

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">
                Submitted as {user?.email ?? 'anonymous'}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={busy || !text.trim()}
                  className="text-xs px-4 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300">
                  {busy ? 'Sending…' : 'Send feedback'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
