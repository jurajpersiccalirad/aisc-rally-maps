import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../amplify/data/resource';
import { isBackendConfigured } from './amplify-config';

let client: ReturnType<typeof generateClient<Schema>> | null = null;

export function getClient(): ReturnType<typeof generateClient<Schema>> {
  if (!isBackendConfigured) {
    throw new Error(
      'Backend not configured — run `npx ampx sandbox` and reload.',
    );
  }
  if (!client) client = generateClient<Schema>();
  return client;
}
