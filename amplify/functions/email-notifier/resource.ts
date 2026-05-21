import { defineFunction } from '@aws-amplify/backend';

export const emailNotifier = defineFunction({
  name: 'email-notifier',
  entry: './handler.ts',
  timeoutSeconds: 15,
});
