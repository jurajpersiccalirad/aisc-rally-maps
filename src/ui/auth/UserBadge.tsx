import { isBackendConfigured } from '../../lib/amplify-config';
import { useAuth } from '../../state/authStore';

export function UserBadge() {
  const { user, logout } = useAuth();
  if (!isBackendConfigured || !user) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span>
        {user.email}
        <span className="ml-1 text-slate-400">({user.role ?? 'no role'})</span>
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
      >
        Sign out
      </button>
    </div>
  );
}
