import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { adminUserManager } from '../functions/admin-user-manager/resource';
import { emailNotifier } from '../functions/email-notifier/resource';

/**
 * AppSync schema.
 *
 *   Event       — one row per rally project. USER owns rows where ownerId
 *                 matches their cognito:sub; ADMIN can read all + update
 *                 status during the publishing workflow.
 *
 *   UserProfile — display metadata mirroring a Cognito user. USER reads own,
 *                 ADMIN does everything.
 *
 *   admin*      — custom mutations gated to the ADMIN group; each is routed
 *                 to the `admin-user-manager` Lambda which discriminates on
 *                 `event.info.fieldName`.
 */
const schema = a.schema({
  Event: a
    .model({
      ownerId: a.string().required(),
      ownerEmail: a.string().required(),
      eventName: a.string().required(),
      /** Human-readable version label, e.g. "v1", "Final". */
      version: a.string(),
      status: a.enum(['DRAFT', 'SUBMITTED', 'PUBLISHED', 'REJECTED']),
      projectJsonKey: a.string(),
      exportZipKey: a.string(),
      stageCount: a.integer(),
      trackCount: a.integer(),
      submittedAt: a.datetime(),
      publishedAt: a.datetime(),
      reviewedBy: a.string(),
      reviewNote: a.string(),
      /** JSON-serialised AuditEntry[] appended on each status change. */
      auditLog: a.string(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('ownerId').to(['create', 'read', 'update', 'delete']),
      allow.group('ADMIN').to(['create', 'read', 'update', 'delete']),
    ])
    .secondaryIndexes((index) => [
      index('status').sortKeys(['submittedAt']).name('byStatus'),
      index('ownerId').sortKeys(['submittedAt']).name('byOwner'),
    ]),

  UserProfile: a
    .model({
      cognitoSub: a.string().required(),
      email: a.string().required(),
      displayName: a.string(),
      role: a.enum(['ADMIN', 'USER']),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('cognitoSub').to(['read']),
      allow.group('ADMIN').to(['create', 'read', 'update', 'delete']),
    ])
    .secondaryIndexes((index) => [
      index('email').name('byEmail'),
    ]),

  adminListUsers: a
    .query()
    .returns(a.json())
    .authorization((allow) => [allow.group('ADMIN')])
    .handler(a.handler.function(adminUserManager)),

  adminCreateUser: a
    .mutation()
    .arguments({
      email: a.string().required(),
      displayName: a.string(),
      role: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.group('ADMIN')])
    .handler(a.handler.function(adminUserManager)),

  adminDeleteUser: a
    .mutation()
    .arguments({ username: a.string().required() })
    .returns(a.json())
    .authorization((allow) => [allow.group('ADMIN')])
    .handler(a.handler.function(adminUserManager)),

  adminResetPassword: a
    .mutation()
    .arguments({ username: a.string().required() })
    .returns(a.json())
    .authorization((allow) => [allow.group('ADMIN')])
    .handler(a.handler.function(adminUserManager)),

  adminSetRole: a
    .mutation()
    .arguments({
      username: a.string().required(),
      role: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.group('ADMIN')])
    .handler(a.handler.function(adminUserManager)),

  Feedback: a
    .model({
      userId: a.string().required(),
      userEmail: a.string(),
      category: a.enum(['BUG', 'FEATURE', 'OTHER']),
      text: a.string().required(),
      createdAt: a.datetime().required(),
      resolved: a.boolean(),
      resolvedAt: a.datetime(),
      resolvedBy: a.string(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('userId').to(['create', 'read']),
      allow.group('ADMIN').to(['read', 'update', 'delete']),
    ]),

  FeedbackComment: a
    .model({
      feedbackId: a.string().required(),
      authorId: a.string().required(),
      authorEmail: a.string(),
      isAdmin: a.boolean(),
      text: a.string().required(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn('authorId').to(['create', 'read', 'delete']),
      allow.group('ADMIN').to(['create', 'read', 'delete']),
      allow.authenticated().to(['read']),
    ])
    .secondaryIndexes((index) => [
      index('feedbackId').sortKeys(['createdAt']).name('byFeedback'),
    ]),

  sendNotification: a
    .mutation()
    .arguments({
      to: a.string().required(),
      subject: a.string().required(),
      body: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.group('ADMIN')])
    .handler(a.handler.function(emailNotifier)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
