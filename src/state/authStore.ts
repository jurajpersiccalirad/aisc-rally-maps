import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
} from 'aws-amplify/auth';
import { create } from 'zustand';
import { isBackendConfigured } from '../lib/amplify-config';

export type Role = 'ADMIN' | 'USER' | null;

export interface AuthUser {
  userId: string;
  username: string;
  email: string;
  role: Role;
  groups: string[];
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  newPasswordRequired: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  confirmNewPassword: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function deriveRole(groups: string[]): Role {
  if (groups.includes('ADMIN')) return 'ADMIN';
  if (groups.includes('USER')) return 'USER';
  return null;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: isBackendConfigured,
  error: null,
  newPasswordRequired: false,

  initialize: async () => {
    if (!isBackendConfigured) {
      set({ loading: false });
      return;
    }
    try {
      const cogUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const access = session.tokens?.accessToken?.payload as
        | Record<string, unknown>
        | undefined;
      const id = session.tokens?.idToken?.payload as
        | Record<string, unknown>
        | undefined;
      const groups = (access?.['cognito:groups'] as string[] | undefined) ?? [];
      const email =
        (id?.['email'] as string | undefined) ??
        (id?.['preferred_username'] as string | undefined) ??
        cogUser.signInDetails?.loginId ??
        '';
      set({
        user: {
          userId: cogUser.userId,
          username: cogUser.username,
          email,
          role: deriveRole(groups),
          groups,
        },
        loading: false,
        error: null,
      });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const result = await signIn({ username: email, password });
      if (
        result.nextStep?.signInStep ===
        'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED'
      ) {
        set({ newPasswordRequired: true, loading: false });
        return;
      }
      await get().initialize();
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  confirmNewPassword: async (newPassword) => {
    set({ loading: true, error: null });
    try {
      await confirmSignIn({ challengeResponse: newPassword });
      set({ newPasswordRequired: false });
      await get().initialize();
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  logout: async () => {
    try {
      if (isBackendConfigured) await signOut();
    } finally {
      set({ user: null, error: null });
    }
  },

  clearError: () => set({ error: null }),
}));
