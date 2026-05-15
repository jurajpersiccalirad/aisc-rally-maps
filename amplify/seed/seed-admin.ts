/**
 * Seeds the initial admin user "Andrej" against the deployed Cognito user
 * pool referenced by the project's amplify_outputs.json.
 *
 * Run AFTER the first successful `npx ampx sandbox` (or pipeline deploy):
 *
 *   ANDREJ_EMAIL=andrej@example.com npx tsx amplify/seed/seed-admin.ts
 *
 * The script is idempotent — if the user already exists, it just ensures
 * they are in the ADMIN group and prints the current status.
 */
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

interface AmplifyOutputs {
  auth?: {
    user_pool_id?: string;
    aws_region?: string;
  };
}

function loadOutputs(): AmplifyOutputs {
  const path = resolve(__dirname, '../../amplify_outputs.json');
  return JSON.parse(readFileSync(path, 'utf8')) as AmplifyOutputs;
}

function tempPassword(): string {
  return `${randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}9!Aa`;
}

async function main(): Promise<void> {
  const outputs = loadOutputs();
  const userPoolId = outputs.auth?.user_pool_id;
  const region = outputs.auth?.aws_region ?? process.env.AWS_REGION;
  if (!userPoolId) {
    throw new Error(
      'amplify_outputs.json is missing auth.user_pool_id — run `npx ampx sandbox` first.',
    );
  }

  const email = process.env.ANDREJ_EMAIL ?? 'andrej@example.com';
  const displayName = process.env.ANDREJ_NAME ?? 'Andrej';
  const cognito = new CognitoIdentityProviderClient({ region });

  let created = false;
  let printedPassword: string | undefined;

  try {
    await cognito.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
    );
    console.log(`User ${email} already exists — ensuring ADMIN group only.`);
  } catch {
    const password = tempPassword();
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'preferred_username', Value: displayName },
        ],
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS',
      }),
    ).catch((e: unknown) => {
      if (e instanceof UsernameExistsException) return undefined;
      throw e;
    });
    created = true;
    printedPassword = password;
  }

  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: email,
      GroupName: 'ADMIN',
    }),
  );

  await cognito
    .send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: 'USER',
      }),
    )
    .catch(() => undefined);

  if (created) {
    console.log(`Seeded ADMIN user:`);
    console.log(`  email:           ${email}`);
    console.log(`  display name:    ${displayName}`);
    console.log(`  temp password:   ${printedPassword}`);
    console.log(
      `\nLog in once with the temp password — Cognito will prompt for a permanent one.`,
    );
  } else {
    console.log(`ADMIN role ensured for ${email}.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
