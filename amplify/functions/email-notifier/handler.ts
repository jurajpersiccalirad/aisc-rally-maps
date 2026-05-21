import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({});
const FROM_EMAIL = process.env.FROM_EMAIL ?? '';

interface AppSyncEvent {
  fieldName?: string;
  arguments: { to: string; subject: string; body: string };
  identity?: { groups?: string[]; claims?: Record<string, unknown> };
}

export const handler = async (event: AppSyncEvent): Promise<unknown> => {
  if (!FROM_EMAIL) {
    throw new Error(
      'FROM_EMAIL env var is not set. Verify a sender address in SES and set FROM_EMAIL in amplify/backend.ts.',
    );
  }
  const groups: string[] = Array.isArray(event.identity?.groups)
    ? (event.identity!.groups as string[])
    : Array.isArray(event.identity?.claims?.['cognito:groups'])
      ? (event.identity!.claims!['cognito:groups'] as string[])
      : [];
  if (!groups.includes('ADMIN')) throw new Error('Forbidden: ADMIN group required.');

  const { to, subject, body } = event.arguments;
  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } },
      },
    }),
  );
  return { ok: true };
};
