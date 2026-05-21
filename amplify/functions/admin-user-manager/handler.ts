import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'node:crypto';

const USER_POOL_ID = process.env.USER_POOL_ID ?? '';
const cognito = new CognitoIdentityProviderClient({});

interface AdminUser {
  username: string;
  email: string;
  displayName?: string;
  role: 'ADMIN' | 'USER' | 'NONE';
  enabled: boolean;
  status?: string;
  created?: string;
}

function attr(
  attrs: Array<{ Name?: string; Value?: string }> | undefined,
  name: string,
): string | undefined {
  return attrs?.find((a) => a.Name === name)?.Value;
}

function randomTempPassword(): string {
  return `${randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}9!Aa`;
}

async function getPrimaryRole(
  username: string,
): Promise<'ADMIN' | 'USER' | 'NONE'> {
  const res = await cognito.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    }),
  );
  const groups = (res.Groups ?? []).map((g) => g.GroupName);
  if (groups.includes('ADMIN')) return 'ADMIN';
  if (groups.includes('USER')) return 'USER';
  return 'NONE';
}

async function listUsers(): Promise<AdminUser[]> {
  const result: AdminUser[] = [];
  let token: string | undefined;
  do {
    const page = await cognito.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        PaginationToken: token,
      }),
    );
    for (const u of page.Users ?? []) {
      if (!u.Username) continue;
      const role = await getPrimaryRole(u.Username);
      result.push({
        username: u.Username,
        email: attr(u.Attributes, 'email') ?? '',
        displayName: attr(u.Attributes, 'preferred_username'),
        role,
        enabled: u.Enabled ?? false,
        status: u.UserStatus,
        created: u.UserCreateDate?.toISOString(),
      });
    }
    token = page.PaginationToken;
  } while (token);
  return result;
}

async function createUser(
  email: string,
  displayName: string | undefined,
  role: 'ADMIN' | 'USER',
): Promise<{ username: string; tempPassword: string }> {
  const tempPassword = randomTempPassword();
  const userAttrs: Array<{ Name: string; Value: string }> = [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
  ];
  if (displayName) {
    userAttrs.push({ Name: 'preferred_username', Value: displayName });
  }
  const create = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: userAttrs,
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS',
    }),
  );
  const username = create.User?.Username ?? email;
  if (role !== 'USER') {
    await cognito
      .send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: 'USER',
        }),
      )
      .catch(() => undefined);
  }
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: role,
    }),
  );
  return { username, tempPassword };
}

async function deleteUser(username: string): Promise<void> {
  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    }),
  );
}

async function resetPassword(
  username: string,
): Promise<{ tempPassword: string }> {
  const tempPassword = randomTempPassword();
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      Password: tempPassword,
      Permanent: false,
    }),
  );
  return { tempPassword };
}

async function setRole(
  username: string,
  role: 'ADMIN' | 'USER',
): Promise<void> {
  const other = role === 'ADMIN' ? 'USER' : 'ADMIN';
  await cognito
    .send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        GroupName: other,
      }),
    )
    .catch(() => undefined);
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: role,
    }),
  );
}

/**
 * Single AppSync handler discriminated by the operation's field name.
 *
 * The Amplify Gen 2 VTL function-resolver template sends:
 *   { typeName, fieldName, arguments, identity, source, request, prev }
 * i.e. fieldName is at the TOP LEVEL — there is no `info` wrapper.
 * Authorization is enforced at the schema level via `allow.group('ADMIN')`;
 * we double-check here via identity.groups (Cognito groups) for defence in
 * depth.
 */
interface AppSyncEvent {
  /** Top-level fieldName injected by Amplify's VTL resolver template. */
  fieldName?: string;
  typeName?: string;
  arguments: Record<string, unknown>;
  identity?: {
    groups?: string[];
    claims?: Record<string, unknown>;
  };
}

export const handler = async (event: AppSyncEvent): Promise<unknown> => {
  if (!USER_POOL_ID) {
    throw new Error('USER_POOL_ID environment variable is missing.');
  }
  const groups = event.identity?.groups ?? [];
  if (!groups.includes('ADMIN')) {
    throw new Error('Forbidden: ADMIN group required.');
  }
  const field = event.fieldName;
  const args = event.arguments;
  switch (field) {
    case 'adminListUsers':
      return { users: await listUsers() };
    case 'adminCreateUser':
      return await createUser(
        String(args.email),
        args.displayName ? String(args.displayName) : undefined,
        String(args.role) === 'ADMIN' ? 'ADMIN' : 'USER',
      );
    case 'adminDeleteUser':
      await deleteUser(String(args.username));
      return { ok: true };
    case 'adminResetPassword':
      return await resetPassword(String(args.username));
    case 'adminSetRole':
      await setRole(
        String(args.username),
        String(args.role) === 'ADMIN' ? 'ADMIN' : 'USER',
      );
      return { ok: true };
    default:
      throw new Error(`Unknown admin operation: ${field ?? '(none)'}`);
  }
};
