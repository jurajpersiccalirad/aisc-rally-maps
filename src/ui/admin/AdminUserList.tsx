import { useCallback, useEffect, useState } from 'react';
import { getClient } from '../../lib/amplify-client';

interface AdminUser {
  username: string;
  email: string;
  displayName?: string;
  role: 'ADMIN' | 'USER' | 'NONE';
  enabled: boolean;
  status?: string;
  created?: string;
}

interface ListUsersResult {
  users?: AdminUser[];
}
interface CreateUserResult {
  username?: string;
  tempPassword?: string;
}
interface ResetPasswordResult {
  tempPassword?: string;
}

function unwrap<T>(
  result: { data: unknown; errors?: Array<{ message: string }> },
): T {
  if (result.errors && result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join('; '));
  }
  return result.data as T;
}

export function AdminUserList() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');
  const [issuedTemp, setIssuedTemp] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getClient();
      const res = unwrap<ListUsersResult>(await client.queries.adminListUsers());
      setUsers(res.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('create');
    setIssuedTemp(null);
    try {
      const client = getClient();
      const res = unwrap<CreateUserResult>(
        await client.mutations.adminCreateUser({
          email: newEmail.trim(),
          displayName: newName.trim() || undefined,
          role: newRole,
        }),
      );
      if (res.tempPassword) setIssuedTemp(`${newEmail}: ${res.tempPassword}`);
      setNewEmail('');
      setNewName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (u: AdminUser) => {
    if (
      !window.confirm(
        `Delete user ${u.email}? This cannot be undone (Cognito).`,
      )
    )
      return;
    setBusy(u.username);
    try {
      const client = getClient();
      unwrap(await client.mutations.adminDeleteUser({ username: u.username }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleResetPw = async (u: AdminUser) => {
    setBusy(u.username);
    setIssuedTemp(null);
    try {
      const client = getClient();
      const res = unwrap<ResetPasswordResult>(
        await client.mutations.adminResetPassword({ username: u.username }),
      );
      if (res.tempPassword) {
        setIssuedTemp(`${u.email}: ${res.tempPassword}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleSetRole = async (u: AdminUser, role: 'ADMIN' | 'USER') => {
    setBusy(u.username);
    try {
      const client = getClient();
      unwrap(
        await client.mutations.adminSetRole({
          username: u.username,
          role,
        }),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Users</h2>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="rounded border border-slate-200 bg-white p-3 space-y-2"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Create user
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email"
            required
            className="text-sm rounded border border-slate-300 px-2 py-1 flex-1 min-w-[200px]"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="display name (optional)"
            className="text-sm rounded border border-slate-300 px-2 py-1 flex-1 min-w-[160px]"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'USER' | 'ADMIN')}
            className="text-sm rounded border border-slate-300 px-2 py-1"
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button
            type="submit"
            disabled={busy === 'create'}
            className="text-sm px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300"
          >
            {busy === 'create' ? 'Creating…' : 'Create'}
          </button>
        </div>
        {issuedTemp && (
          <div className="text-xs rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-900">
            Temporary password:{' '}
            <span className="font-mono">{issuedTemp}</span>
            <div className="text-[11px] text-amber-700">
              Share securely; user must change on first sign-in.
            </div>
          </div>
        )}
      </form>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Loading users…</p>
      ) : (
        <ul className="space-y-1">
          {users.map((u) => (
            <li
              key={u.username}
              className="border border-slate-200 rounded bg-white px-3 py-2 text-sm flex items-center gap-2 flex-wrap"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{u.email}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {u.displayName ?? ''} ·{' '}
                  <span
                    className={
                      u.role === 'ADMIN'
                        ? 'text-emerald-700 font-semibold'
                        : 'text-slate-700'
                    }
                  >
                    {u.role}
                  </span>{' '}
                  · {u.status ?? '—'}
                  {!u.enabled && ' · disabled'}
                </div>
              </div>
              {u.role !== 'ADMIN' ? (
                <button
                  type="button"
                  disabled={busy === u.username}
                  onClick={() => void handleSetRole(u, 'ADMIN')}
                  className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                >
                  Make admin
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy === u.username}
                  onClick={() => void handleSetRole(u, 'USER')}
                  className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                >
                  Demote
                </button>
              )}
              <button
                type="button"
                disabled={busy === u.username}
                onClick={() => void handleResetPw(u)}
                className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
              >
                Reset password
              </button>
              <button
                type="button"
                disabled={busy === u.username}
                onClick={() => void handleDelete(u)}
                className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
