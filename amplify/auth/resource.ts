import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';

/**
 * Two-role Cognito setup:
 *   - ADMIN — can see every event, review the publishing queue, manage users.
 *   - USER  — regular rally organiser; sees only their own events.
 *
 * Self-registration is disabled by default in this configuration; admins
 * provision users via the `admin-user-manager` Lambda. The post-confirmation
 * trigger remains as a belt-and-braces fallback (auto-assigns USER group).
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['ADMIN', 'USER'],
  triggers: {
    postConfirmation,
  },
  userAttributes: {
    email: {
      required: true,
      mutable: true,
    },
    preferredUsername: {
      required: false,
      mutable: true,
    },
  },
});
