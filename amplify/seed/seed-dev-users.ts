/**
 * Seeds two dev/test users in the Cognito user pool.
 *
 *   admin@dev  — ADMIN group  — password: Admin1234
 *   user@dev   — USER group   — password: User1234
 *
 * Passwords are set as permanent (no forced change on first login).
 * Idempotent — safe to run multiple times.
 *
 *   npm run seed:dev
 */
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

interface AmplifyOutputs {
  auth?: { user_pool_id?: string; aws_region?: string };
}

function loadOutputs(): AmplifyOutputs {
  const path = resolve(__dirname, '../../amplify_outputs.json');
  return JSON.parse(readFileSync(path, 'utf8')) as AmplifyOutputs;
}

const DEV_USERS = [
  { email: 'admin@dev', displayName: 'Admin', password: 'Admin123!', group: 'ADMIN', removeGroup: 'USER' },
  { email: 'user@dev',  displayName: 'User',  password: 'User1234!', group: 'USER',  removeGroup: 'ADMIN' },
] as const;

async function ensureUser(
  cognito: CognitoIdentityProviderClient,
  userPoolId: string,
  { email, displayName, password, group, removeGroup }: typeof DEV_USERS[number],
): Promise<void> {
  // Create user (suppress the welcome email)
  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'preferred_username', Value: displayName },
      ],
      MessageAction: 'SUPPRESS',
      TemporaryPassword: password,
    }));
    console.log(`  created  ${email}`);
  } catch (e) {
    if (e instanceof UsernameExistsException) {
      console.log(`  exists   ${email}`);
    } else {
      throw e;
    }
  }

  // Set permanent password — no forced change on login
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: email,
    Password: password,
    Permanent: true,
  }));

  // Assign to the correct group
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: email,
    GroupName: group,
  }));

  // Remove from the other group (idempotent)
  await cognito.send(new AdminRemoveUserFromGroupCommand({
    UserPoolId: userPoolId,
    Username: email,
    GroupName: removeGroup,
  })).catch(() => undefined);

  console.log(`  group    ${email} → ${group}`);
  console.log(`  password ${email} → ${password}`);
}

async function main(): Promise<void> {
  const outputs = loadOutputs();
  const userPoolId = outputs.auth?.user_pool_id;
  const region = outputs.auth?.aws_region ?? process.env.AWS_REGION;
  if (!userPoolId) {
    throw new Error('amplify_outputs.json missing auth.user_pool_id — run `npx ampx sandbox` first.');
  }

  const cognito = new CognitoIdentityProviderClient({ region });

  console.log('Seeding dev users...\n');
  for (const u of DEV_USERS) {
    await ensureUser(cognito, userPoolId, u);
    console.log();
  }
  console.log('Done. Log in at http://localhost:5173');
}

main().catch(e => { console.error(e); process.exit(1); });
