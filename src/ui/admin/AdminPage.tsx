import { useState } from 'react';
import { AdminEventList } from './AdminEventList';
import { AdminFeedbackList } from './AdminFeedbackList';
import { AdminUserList } from './AdminUserList';

type Tab = 'events' | 'users' | 'feedback';

export function AdminPage({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('events');
  return (
    <main className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <h2 className="text-base font-semibold mr-4">Admin</h2>
          {(['events', 'users', 'feedback'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'text-sm px-3 py-1 rounded capitalize',
                tab === t
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
        >
          ← Back to editor
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {tab === 'events' && <AdminEventList onClose={onClose} />}
          {tab === 'users' && <AdminUserList />}
          {tab === 'feedback' && <AdminFeedbackList />}
        </div>
      </div>
    </main>
  );
}
