import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { PostConfirmationTriggerHandler } from 'aws-lambda';

const client = new CognitoIdentityProviderClient({});

/**
 * Auto-assign every self-registered user to the USER group. Admin
 * promotions happen via the admin-user-manager Lambda.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  await client.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: 'USER',
    }),
  );
  return event;
};
