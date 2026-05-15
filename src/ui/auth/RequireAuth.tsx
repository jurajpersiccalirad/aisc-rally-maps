import { useEffect, type ReactNode } from 'react';
import { isBackendConfigured } from '../../lib/amplify-config';
import { useAuth } from '../../state/authStore';
import { LoginPage } from './LoginPage';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, initialize } = useAuth();

  useEffect(() => {
    if (isBackendConfigured) void initialize();
  }, [initialize]);

  // Local-only mode: no backend wired, app runs without login.
  if (!isBackendConfigured) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) return <LoginPage />;
  return <>{children}</>;
}
