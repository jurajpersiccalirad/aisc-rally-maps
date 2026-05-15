import { Amplify } from 'aws-amplify';

// Vite-side conditional import. When `amplify_outputs.json` is missing
// (e.g. before `npx ampx sandbox` has been run), this glob simply returns
// an empty object and the app falls back to local-only mode (no auth, no
// publish workflow).
const modules = import.meta.glob('../../amplify_outputs.json', { eager: true });
const raw = (Object.values(modules)[0] as { default?: unknown } | undefined)
  ?.default;

interface OutputsShape {
  auth?: { user_pool_id?: string };
}

function looksConfigured(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const id = (o as OutputsShape).auth?.user_pool_id;
  return typeof id === 'string' && id.length > 0 && !id.includes('PLACEHOLDER');
}

export const amplifyOutputs: unknown = raw ?? null;
export const isBackendConfigured = looksConfigured(amplifyOutputs);

if (isBackendConfigured) {
  Amplify.configure(
    amplifyOutputs as Parameters<typeof Amplify.configure>[0],
  );
}
