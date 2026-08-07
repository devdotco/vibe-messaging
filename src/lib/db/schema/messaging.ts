import {
  pgTable, uuid, text, boolean, integer, numeric,
  timestamp, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

// ── Users (shared platform table) ──────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('TEAM_MEMBER'),
  status: text('status').notNull().default('active'),
  isPlatformUser: boolean('is_platform_user').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Sessions ────────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Workspaces ───────────────────────────────────────────────────────────────

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  iconUrl: text('icon_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── Channels ─────────────────────────────────────────────────────────────────

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull().default('public'),
  isArchived: boolean('is_archived').default(false),
  isDefault: boolean('is_default').default(false),
  claudeEnabled: boolean('claude_enabled').default(true),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const channelMembers = pgTable('channel_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  orgId: text('org_id').notNull(),
  role: text('role').default('member'),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  notificationPref: text('notification_pref').default('all'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
});

// ── Messages ──────────────────────────────────────────────────────────────────

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  content: text('content').notNull(),
  contentHtml: text('content_html'),
  isAiResponse: boolean('is_ai_response').default(false),
  aiModel: text('ai_model'),
  aiTokensUsed: integer('ai_tokens_used'),
  aiCostUsd: numeric('ai_cost_usd', { precision: 10, scale: 6 }),
  parentMessageId: uuid('parent_message_id'),
  threadReplyCount: integer('thread_reply_count').default(0),
  threadLastReplyAt: timestamp('thread_last_reply_at', { withTimezone: true }),
  mentions: uuid('mentions').array(),
  hasClaudeMention: boolean('has_claude_mention').default(false),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('messages_channel_created_idx').on(t.channelId, t.createdAt),
  index('messages_parent_idx').on(t.parentMessageId),
  index('messages_claude_mention_idx').on(t.hasClaudeMention),
  index('messages_org_deleted_idx').on(t.orgId, t.deletedAt),
]);

// ── Direct Messages ───────────────────────────────────────────────────────────

export const dmConversations = pgTable('dm_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  participantIds: uuid('participant_ids').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const dmMessages = pgTable('dm_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => dmConversations.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  content: text('content').notNull(),
  isAiResponse: boolean('is_ai_response').default(false),
  aiTokensUsed: integer('ai_tokens_used'),
  aiCostUsd: numeric('ai_cost_usd', { precision: 10, scale: 6 }),
  parentMessageId: uuid('parent_message_id'),
  hasClaudeMention: boolean('has_claude_mention').default(false),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Reactions ─────────────────────────────────────────────────────────────────

export const messageReactions = pgTable('message_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  emoji: text('emoji').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('reactions_unique_idx').on(t.messageId, t.userId, t.emoji),
]);

// ── Attachments ───────────────────────────────────────────────────────────────

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull(),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size'),
  thumbnailUrl: text('thumbnail_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Presence ──────────────────────────────────────────────────────────────────

export const userPresence = pgTable('user_presence', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(),
  orgId: text('org_id').notNull(),
  status: text('status').default('offline'),
  statusMessage: text('status_message'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── Notifications ─────────────────────────────────────────────────────────────

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  orgId: text('org_id').notNull(),
  type: text('type').notNull(),
  channelId: uuid('channel_id'),
  messageId: uuid('message_id'),
  triggeredByUserId: uuid('triggered_by_user_id'),
  isRead: boolean('is_read').default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('notifications_user_idx').on(t.userId, t.isRead, t.createdAt),
]);

// ── Claude RBAC ───────────────────────────────────────────────────────────────

export const claudeRolePolicies = pgTable('claude_role_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  role: text('role').notNull(),
  dataDomain: text('data_domain').notNull(),
  allowed: boolean('allowed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('policies_unique_idx').on(t.orgId, t.role, t.dataDomain),
]);

// ── Claude Usage Log ──────────────────────────────────────────────────────────

export const claudeUsageLog = pgTable('claude_usage_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  channelId: uuid('channel_id'),
  messageId: uuid('message_id').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
  domainsAccessed: text('domains_accessed').array(),
  queryDurationMs: integer('query_duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('usage_org_idx').on(t.orgId, t.createdAt),
  index('usage_user_idx').on(t.userId, t.createdAt),
]);

// ── Airbyte Connections ───────────────────────────────────────────────────────

export const airbyteConnections = pgTable('airbyte_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  displayName: text('display_name').notNull(),
  sourceType: text('source_type').notNull(),
  airbyteConnectionId: text('airbyte_connection_id').notNull(),
  warehouseSchema: text('warehouse_schema').notNull(),
  dataDomains: text('data_domains').array(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  syncStatus: text('sync_status').default('unknown'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── PM Integration ────────────────────────────────────────────────────────────

export const messageTaskLinks = pgTable('message_task_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  messageId: uuid('message_id').notNull(),
  taskId: uuid('task_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const channelProjectLinks = pgTable('channel_project_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull(),
  notifyOn: text('notify_on').array().default(['task.created', 'task.completed', 'task.overdue']),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('channel_project_unique_idx').on(t.channelId, t.projectId),
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type ChannelMember = typeof channelMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type DmConversation = typeof dmConversations.$inferSelect;
export type DmMessage = typeof dmMessages.$inferSelect;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type UserPresence = typeof userPresence.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ClaudeRolePolicy = typeof claudeRolePolicies.$inferSelect;
export type ClaudeUsageLog = typeof claudeUsageLog.$inferSelect;
export type AirbyteConnection = typeof airbyteConnections.$inferSelect;
export type MessageTaskLink = typeof messageTaskLinks.$inferSelect;
export type ChannelProjectLink = typeof channelProjectLinks.$inferSelect;
