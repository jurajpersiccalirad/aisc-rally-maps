import { getUrl } from 'aws-amplify/storage';
import { useCallback, useEffect, useState } from 'react';
import type { Schema } from '../../../amplify/data/resource';
import { deserializeProject } from '../../export/projectJson';
import { getClient } from '../../lib/amplify-client';
import { useAuth } from '../../state/authStore';
import { useProjectDispatch } from '../../state/useProject';
import type { ProjectState } from '../../types';
import { EventDiffModal } from './EventDiffModal';

type EventRow = Schema['Event']['type'];
type Status = NonNullable<EventRow['status']>;

export interface AuditEntry {
  action: string;
  by: string;
  at: string;
  note?: string;
}

function parseAuditLog(raw: string | null | undefined): AuditEntry[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as AuditEntry[]; }
  catch { return []; }
}

function appendAuditEntry(existing: string | null | undefined, entry: AuditEntry): string {
  const log = parseAuditLog(existing);
  return JSON.stringify([...log, entry]);
}

const STATUS_ORDER: Status[] = ['SUBMITTED', 'PUBLISHED', 'REJECTED', 'DRAFT'];

const STATUS_PILL: Record<Status, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  DRAFT: 'bg-slate-100 text-slate-600',
};

// ── component ─────────────────────────────────────────────────────────────────

export function AdminEventList({ onClose }: { onClose?: () => void }) {
  const dispatch = useProjectDispatch();
  const { user } = useAuth();

  // ── data ──────────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // ── filter / grouping (C17, C20) ──────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set(STATUS_ORDER));
  const [groupBy, setGroupBy] = useState<'status' | 'name'>('status');

  // ── bulk selection (C18) ──────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── preview / audit expansion (C13, C19) ─────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState<Set<string>>(new Set());
  const [previewData, setPreviewData] = useState<Map<string, ProjectState>>(new Map());
  const [auditOpen, setAuditOpen] = useState<Set<string>>(new Set());

  // ── diff (C21) ────────────────────────────────────────────────────────────
  const [diffA, setDiffA] = useState<EventRow | null>(null);
  const [diffB, setDiffB] = useState<EventRow | null>(null);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getClient();
      const { data } = await client.models.Event.list({ limit: 1000 });
      data.sort((a, b) =>
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

  useEffect(() => { void load(); }, [load]);

  // ── status update with audit log + email (C19, C22) ───────────────────────
  const updateStatus = async (row: EventRow, status: Status, note?: string) => {
    setBusyIds((s) => new Set(s).add(row.id));
    try {
      const client = getClient();
      const auditEntry: AuditEntry = {
        action: status,
        by: user?.email ?? 'admin',
        at: new Date().toISOString(),
        note: note || undefined,
      };
      await client.models.Event.update({
        id: row.id,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date().toISOString() : undefined,
        reviewedBy: user?.email,
        reviewNote: note,
        auditLog: appendAuditEntry(row.auditLog, auditEntry),
      });

      // C22 — fire-and-forget email to event owner
      void sendStatusEmail(client, row, status, note);

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(row.id); return n; });
    }
  };

  const sendStatusEmail = async (
    client: ReturnType<typeof getClient>,
    row: EventRow,
    status: Status,
    note?: string,
  ) => {
    if (!row.ownerEmail) return;
    const name = [row.eventName, row.version].filter(Boolean).join(' ');
    try {
      if (status === 'PUBLISHED') {
        await client.mutations.sendNotification({
          to: row.ownerEmail,
          subject: `Your event "${name}" has been published`,
          body: `Your rally event "${name}" has been reviewed and published. You can download the approved export from your submissions page.`,
        });
      } else if (status === 'REJECTED') {
        await client.mutations.sendNotification({
          to: row.ownerEmail,
          subject: `Your event "${name}" needs revision`,
          body: `Your rally event "${name}" was reviewed and returned for revision.\n\nFeedback: ${note ?? '(no note provided)'}\n\nPlease make the necessary changes and resubmit.`,
        });
      }
    } catch {
      // email is best-effort; don't surface SES config errors to the UI
    }
  };

  // ── bulk actions (C18) ────────────────────────────────────────────────────
  const bulkUpdate = async (status: Status, note?: string) => {
    const targets = events.filter(
      (e) => selected.has(e.id) && e.status === 'SUBMITTED',
    );
    for (const row of targets) await updateStatus(row, status, note);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectAllSubmitted = () =>
    setSelected(new Set(events.filter((e) => e.status === 'SUBMITTED').map((e) => e.id)));

  // ── S3 helpers ────────────────────────────────────────────────────────────
  const downloadZip = async (key: string | null | undefined) => {
    if (!key) return;
    try {
      const { url } = await getUrl({ path: key, options: { expiresIn: 300 } });
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const openInEditor = async (row: EventRow) => {
    if (!row.projectJsonKey) { setError('No project JSON for this event.'); return; }
    setBusyIds((s) => new Set(s).add(row.id));
    try {
      const { url } = await getUrl({ path: row.projectJsonKey, options: { expiresIn: 300 } });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
      const loaded = deserializeProject(await res.text());
      dispatch({ type: 'LOAD_PROJECT_JSON', state: loaded });
      onClose?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusyIds((s) => { const n = new Set(s); n.delete(row.id); return n; }); }
  };

  // ── C13 — file preview ────────────────────────────────────────────────────
  const togglePreview = async (row: EventRow) => {
    const next = new Set(previewOpen);
    if (next.has(row.id)) { next.delete(row.id); setPreviewOpen(next); return; }
    next.add(row.id);
    setPreviewOpen(next);
    if (previewData.has(row.id) || !row.projectJsonKey) return;
    try {
      const { url } = await getUrl({ path: row.projectJsonKey, options: { expiresIn: 300 } });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`S3 fetch failed: ${res.status}`);
      const ps = deserializeProject(await res.text());
      setPreviewData((m) => new Map(m).set(row.id, ps));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  // ── C21 — diff selection ──────────────────────────────────────────────────
  const pickForDiff = (row: EventRow) => {
    if (!diffA) { setDiffA(row); return; }
    if (diffA.id === row.id) { setDiffA(null); return; }
    setDiffB(row);
  };

  // ── derived: filter + grouping ────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = events.filter((e) => {
    if (!statusFilter.has((e.status ?? 'DRAFT') as Status)) return false;
    if (q && !e.eventName?.toLowerCase().includes(q) && !e.ownerEmail?.toLowerCase().includes(q)) return false;
    return true;
  });

  const grouped: Map<string, EventRow[]> = new Map();
  if (groupBy === 'status') {
    for (const s of STATUS_ORDER) {
      grouped.set(s, filtered.filter((e) => (e.status ?? 'DRAFT') === s));
    }
  } else {
    // group by eventName, sort each group by version desc
    for (const e of filtered) {
      const key = e.eventName ?? '(unnamed)';
      const list = grouped.get(key) ?? [];
      list.push(e);
      grouped.set(key, list);
    }
    for (const [k, list] of grouped) {
      grouped.set(k, [...list].sort((a, b) => (b.version ?? '').localeCompare(a.version ?? '')));
    }
  }

  const selectedSubmittedCount = [...selected].filter(
    (id) => events.find((e) => e.id === id)?.status === 'SUBMITTED',
  ).length;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* Header + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold mr-2">All events</h2>
        <input
          type="search"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs rounded border border-slate-300 px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {/* Status filter pills (C17) */}
        {STATUS_ORDER.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() =>
              setStatusFilter((prev) => {
                const next = new Set(prev);
                if (next.has(st)) next.delete(st); else next.add(st);
                return next;
              })
            }
            className={[
              'text-[11px] px-2 py-0.5 rounded border transition-colors',
              statusFilter.has(st)
                ? STATUS_PILL[st] + ' border-transparent'
                : 'bg-white text-slate-400 border-slate-200',
            ].join(' ')}
          >
            {st}
          </button>
        ))}
        {/* Group-by toggle (C20) */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-slate-500">Group by</span>
          {(['status', 'name'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={[
                'text-[11px] px-2 py-0.5 rounded border',
                groupBy === g ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              {g}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 ml-1"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Bulk action bar (C18) */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
          <span className="text-blue-800 font-medium">{selected.size} selected</span>
          {selectedSubmittedCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => void bulkUpdate('PUBLISHED')}
                className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Approve {selectedSubmittedCount}
              </button>
              <button
                type="button"
                onClick={() => {
                  const note = window.prompt('Rejection reason for all selected?');
                  if (note !== null) void bulkUpdate('REJECTED', note);
                }}
                className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Reject {selectedSubmittedCount}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-100 ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* Diff hint */}
      {diffA && !diffB && (
        <div className="text-xs text-slate-500 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded">
          Click another <strong>Compare</strong> button to compare with <em>{diffA.eventName}</em>
          {diffA.version ? ` (${diffA.version})` : ''}.{' '}
          <button type="button" onClick={() => setDiffA(null)} className="underline">Cancel</button>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* Select all submitted shortcut */}
          {events.some((e) => e.status === 'SUBMITTED') && (
            <button
              type="button"
              onClick={selectAllSubmitted}
              className="text-[11px] text-blue-600 hover:underline"
            >
              Select all SUBMITTED
            </button>
          )}

          {[...grouped.entries()].map(([groupKey, list]) => (
            <div key={groupKey}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1 flex items-center gap-2">
                {groupBy === 'status' && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_PILL[groupKey as Status]}`}>
                    {groupKey}
                  </span>
                )}
                {groupBy === 'name' && <span>{groupKey}</span>}
                <span className="font-normal text-slate-400">({list.length})</span>
              </h3>
              {list.length === 0 ? (
                <p className="text-xs text-slate-400 italic">none</p>
              ) : (
                <ul className="space-y-1">
                  {list.map((row) => {
                    const status = (row.status ?? 'DRAFT') as Status;
                    const busy = busyIds.has(row.id);
                    const isPreviewOpen = previewOpen.has(row.id);
                    const isAuditOpen = auditOpen.has(row.id);
                    const preview = previewData.get(row.id);
                    const auditEntries = parseAuditLog(row.auditLog);
                    const isDiffSelected = diffA?.id === row.id;

                    return (
                      <li key={row.id} className="border border-slate-200 rounded bg-white text-sm">
                        {/* Main row */}
                        <div className="px-3 py-2 flex items-center gap-2">
                          {/* Bulk checkbox (C18) */}
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            className="accent-blue-600 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {row.eventName}
                              {row.version && (
                                <span className="ml-2 text-[11px] font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {row.version}
                                </span>
                              )}
                              {groupBy === 'name' && (
                                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${STATUS_PILL[status]}`}>
                                  {status}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {row.ownerEmail} · {row.stageCount ?? 0} stages · {row.trackCount ?? 0} tracks ·{' '}
                              {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—'}
                            </div>
                          </div>

                          {/* Action buttons */}
                          {row.exportZipKey && (
                            <button type="button" onClick={() => void downloadZip(row.exportZipKey)}
                              className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
                              ZIP
                            </button>
                          )}
                          {row.projectJsonKey && (
                            <>
                              {/* C13 preview */}
                              <button type="button" onClick={() => void togglePreview(row)}
                                className={`text-xs px-2 py-1 rounded border ${isPreviewOpen ? 'bg-amber-100 border-amber-300 text-amber-800' : 'border-slate-300 hover:bg-slate-50'}`}>
                                {isPreviewOpen ? 'Hide' : 'Preview'}
                              </button>
                              {/* C21 diff */}
                              <button type="button" onClick={() => pickForDiff(row)}
                                className={`text-xs px-2 py-1 rounded border ${isDiffSelected ? 'bg-purple-100 border-purple-300 text-purple-800' : 'border-slate-300 hover:bg-slate-50'}`}>
                                {isDiffSelected ? 'Picking…' : 'Compare'}
                              </button>
                              {/* Fork / open */}
                              <button type="button" disabled={busy}
                                onClick={() => void openInEditor(row)}
                                className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                                Open
                              </button>
                            </>
                          )}
                          {status === 'SUBMITTED' && (
                            <>
                              <button type="button" disabled={busy}
                                onClick={() => void updateStatus(row, 'PUBLISHED')}
                                className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300">
                                Approve
                              </button>
                              <button type="button" disabled={busy}
                                onClick={() => {
                                  const note = window.prompt('Reason for rejection?');
                                  if (note !== null) void updateStatus(row, 'REJECTED', note);
                                }}
                                className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300">
                                Reject
                              </button>
                            </>
                          )}
                          {status === 'PUBLISHED' && (
                            <button type="button" disabled={busy}
                              onClick={() => void updateStatus(row, 'SUBMITTED')}
                              className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
                              Unpublish
                            </button>
                          )}
                          {/* C19 audit toggle */}
                          {(auditEntries.length > 0 || row.submittedAt) && (
                            <button type="button"
                              onClick={() => setAuditOpen((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                                return next;
                              })}
                              className={`text-[11px] px-1.5 py-0.5 rounded border ${isAuditOpen ? 'bg-slate-200 border-slate-400' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                              title="Audit trail">
                              ⏱
                            </button>
                          )}
                        </div>

                        {/* C13 — Project JSON preview */}
                        {isPreviewOpen && (
                          <div className="border-t border-slate-100 px-3 py-2 bg-slate-50 text-xs space-y-1">
                            {!preview ? (
                              <span className="text-slate-400">Loading preview…</span>
                            ) : (
                              <>
                                <div className="font-medium text-slate-700">{preview.eventName || '(unnamed)'}{preview.version ? ` · ${preview.version}` : ''}</div>
                                <div className="text-slate-500">
                                  {preview.stages.length} stage{preview.stages.length !== 1 ? 's' : ''}:{' '}
                                  {preview.stages.map((s) => `${s.exportName} (${s.bufferRadiusM}m)`).join(', ')}
                                </div>
                                <div className="text-slate-500">
                                  {preview.tracks.length} track{preview.tracks.length !== 1 ? 's' : ''}:{' '}
                                  {preview.tracks.slice(0, 6).map((t) => t.name).join(', ')}
                                  {preview.tracks.length > 6 ? ` +${preview.tracks.length - 6} more` : ''}
                                </div>
                                <div className="text-slate-500">
                                  {preview.points.length} point{preview.points.length !== 1 ? 's' : ''} · default buffer {preview.bufferRadiusDefault}m
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* C19 — Audit trail */}
                        {isAuditOpen && (
                          <div className="border-t border-slate-100 px-3 py-2 bg-slate-50 text-[11px] space-y-1">
                            <div className="font-semibold text-slate-600 mb-1">Audit trail</div>
                            {row.submittedAt && (
                              <div className="text-slate-500">
                                <span className="font-medium text-blue-700">SUBMITTED</span>{' '}
                                by {row.ownerEmail} · {new Date(row.submittedAt).toLocaleString()}
                              </div>
                            )}
                            {auditEntries.map((e, i) => (
                              <div key={i} className="text-slate-500">
                                <span className={`font-medium ${e.action === 'PUBLISHED' ? 'text-emerald-700' : e.action === 'REJECTED' ? 'text-red-700' : 'text-slate-700'}`}>
                                  {e.action}
                                </span>{' '}
                                by {e.by} · {new Date(e.at).toLocaleString()}
                                {e.note ? <span className="italic"> — {e.note}</span> : null}
                              </div>
                            ))}
                            {auditEntries.length === 0 && !row.submittedAt && (
                              <div className="text-slate-400 italic">No audit entries yet.</div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* C21 — Diff modal */}
      {diffA && diffB && (
        <EventDiffModal
          eventA={diffA}
          eventB={diffB}
          onClose={() => { setDiffA(null); setDiffB(null); }}
        />
      )}
    </div>
  );
}
