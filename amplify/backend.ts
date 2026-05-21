import { defineBackend } from '@aws-amplify/backend';
import { Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { adminUserManager } from './functions/admin-user-manager/resource';
import { emailNotifier } from './functions/email-notifier/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  adminUserManager,
  emailNotifier,
});

// ── Admin user manager ────────────────────────────────────────────────────────
const userPool = backend.auth.resources.userPool;
backend.adminUserManager.addEnvironment('USER_POOL_ID', userPool.userPoolId);
backend.adminUserManager.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminCreateUser',
      'cognito-idp:AdminDeleteUser',
      'cognito-idp:AdminSetUserPassword',
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:AdminRemoveUserFromGroup',
      'cognito-idp:AdminListGroupsForUser',
      'cognito-idp:AdminGetUser',
      'cognito-idp:ListUsers',
      'cognito-idp:ListUsersInGroup',
    ],
    resources: [userPool.userPoolArn],
  }),
);

// ── Email notifier ────────────────────────────────────────────────────────────
// Set FROM_EMAIL to a SES-verified address for your domain.
// Until set, the Lambda will throw a clear error instead of silently failing.
// To verify: AWS Console → SES → Verified Identities → Create identity.
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@example.com';
backend.emailNotifier.addEnvironment('FROM_EMAIL', FROM_EMAIL);
backend.emailNotifier.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  }),
);

// ── S3 lifecycle rules (C23) ──────────────────────────────────────────────────
// Expire user-submitted drafts/ZIPs after 180 days to control storage costs.
// Published assets (published/*) are retained indefinitely.
const { bucket } = backend.storage.resources;
bucket.addLifecycleRule({
  id: 'expire-user-submissions',
  prefix: 'users/',
  expiration: Duration.days(180),
  enabled: true,
});
