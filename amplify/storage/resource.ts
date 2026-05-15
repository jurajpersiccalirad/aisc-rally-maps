import { defineStorage } from '@aws-amplify/backend';

/**
 * Two access patterns:
 *   users/{entity_id}/...   — owner-scoped working area; one USER's drafts
 *                             and submitted ZIPs live here.
 *   published/...           — admin-managed published assets readable by
 *                             every authenticated user.
 */
export const storage = defineStorage({
  name: 'aiscRallyMapsBucket',
  access: (allow) => ({
    'users/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.groups(['USER']).to(['read', 'write', 'delete']),
      allow.groups(['ADMIN']).to(['read', 'delete']),
    ],
    'published/*': [
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.authenticated.to(['read']),
    ],
  }),
});
