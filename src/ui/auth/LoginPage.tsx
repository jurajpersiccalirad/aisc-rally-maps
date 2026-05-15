import { useState } from 'react';
import { useAuth } from '../../state/authStore';

export function LoginPage() {
  const {
    login,
    confirmNewPassword,
    loading,
    error,
    newPasswordRequired,
    clearError,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(email.trim(), password);
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (newPw !== newPw2) return;
    await confirmNewPassword(newPw);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">AISC Rally Maps</h1>
          <p className="text-sm text-slate-500">
            {newPasswordRequired
              ? 'Set a permanent password for your account.'
              : 'Sign in to continue.'}
          </p>
        </div>

        {newPasswordRequired ? (
          <form onSubmit={(e) => void handleNewPassword(e)} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                New password
              </span>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoFocus
                required
                minLength={8}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Confirm new password
              </span>
              <input
                type="password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
                required
                minLength={8}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
            {newPw && newPw2 && newPw !== newPw2 && (
              <p className="text-xs text-red-600">Passwords do not match.</p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || newPw !== newPw2 || newPw.length < 8}
              className="w-full rounded bg-slate-900 text-white text-sm py-1.5 hover:bg-slate-700 disabled:bg-slate-300"
            >
              {loading ? 'Saving…' : 'Set password & sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                autoComplete="email"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full rounded bg-slate-900 text-white text-sm py-1.5 hover:bg-slate-700 disabled:bg-slate-300"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
