import { useCallback, useEffect, useRef, useState } from 'react';
import type { Schema } from '../../amplify/data/resource';
import { getClient } from '../lib/amplify-client';
import { useAuth } from '../state/authStore';

type CommentRow = Schema['FeedbackComment']['type'];

interface Props {
  feedbackId: string;
  /** If true, shows a resolve/reopen toggle at the top. */
  canResolve?: boolean;
  resolved?: boolean;
  onResolveToggle?: () => Promise<void>;
}

export function FeedbackThread({ feedbackId, canResolve, resolved, onResolveToggle }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const client = getClient();
      const { data } = await client.models.FeedbackComment.list({
        filter: { feedbackId: { eq: feedbackId } },
        limit: 200,
      });
      data.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      setComments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [feedbackId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      await client.models.FeedbackComment.create({
        feedbackId,
        authorId: user.userId,
        authorEmail: user.email,
        isAdmin,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      });
      setText('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const client = getClient();
      await client.models.FeedbackComment.delete({ id });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleResolve = async () => {
    if (!onResolveToggle) return;
    setResolving(true);
    try { await onResolveToggle(); }
    finally { setResolving(false); }
  };

  return (
    <div className="space-y-2">
      {/* Resolve toggle */}
      {canResolve && onResolveToggle && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={resolving}
            onClick={() => void handleResolve()}
            className={[
              'text-xs px-2 py-1 rounded border',
              resolved
                ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
                : 'border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
            ].join(' ')}
          >
            {resolving ? '…' : resolved ? 'Reopen' : '✓ Mark resolved'}
          </button>
          {resolved && <span className="text-[11px] text-emerald-700 font-medium">Resolved</span>}
        </div>
      )}

      {/* Comment thread */}
      {loading ? (
        <p className="text-[11px] text-slate-400">Loading thread…</p>
      ) : (
        <div className="space-y-1.5">
          {comments.map((c) => (
            <div
              key={c.id}
              className={[
                'rounded px-3 py-2 text-xs',
                c.isAdmin
                  ? 'bg-slate-900 text-white ml-4'
                  : 'bg-slate-100 text-slate-800 mr-4',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="font-semibold">
                  {c.isAdmin ? '👤 Admin' : (c.authorEmail ?? 'User')}
                </span>
                <div className="flex items-center gap-2 opacity-70">
                  <span>{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</span>
                  {(isAdmin || c.authorId === user?.userId) && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(c.id)}
                      className="hover:opacity-100 opacity-50"
                      aria-label="Delete"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-600">{error}</p>
      )}

      {/* Reply form */}
      <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-1.5 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={isAdmin ? 'Reply as admin…' : 'Add a comment…'}
          className="flex-1 text-xs rounded border border-slate-300 px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 self-end"
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
