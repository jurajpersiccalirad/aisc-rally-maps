import { defineFunction } from '@aws-amplify/backend';

export const adminUserManager = defineFunction({
  name: 'admin-user-manager',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
