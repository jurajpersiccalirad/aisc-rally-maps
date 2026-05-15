import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { adminUserManager } from './functions/admin-user-manager/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  adminUserManager,
});

// Make the user-pool id available to the admin Lambda + grant the admin APIs
// it needs to call against the pool.
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
