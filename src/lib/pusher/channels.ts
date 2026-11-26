/*
 * Every Pusher channel name this app uses, in one place, `private-` prefixed.
 *
 * Pusher only calls the authEndpoint for `private-`/`presence-` channels;
 * anything else is PUBLIC — any client holding the app key could subscribe
 * to `org-<org>-channel-<id>` directly and read every message, with no auth
 * call at all. These were plain names, so /api/messaging/pusher was dead code.
 * Same fix as vibe-pm's src/lib/pusher/server.ts (shared Pusher app).
 *
 * Pure module: imported by both server routes and client components.
 */

export const orgChannel = (orgId: string) => `private-org-${orgId}`;
export const orgPresenceChannel = (orgId: string) => `private-org-${orgId}-presence`;
export const channelChannel = (orgId: string, channelId: string) => `private-org-${orgId}-channel-${channelId}`;
export const dmChannel = (orgId: string, conversationId: string) => `private-org-${orgId}-dm-${conversationId}`;
export const userChannel = (orgId: string, userId: string) => `private-org-${orgId}-user-${userId}`;

export type ParsedChannel =
  | { kind: 'org'; orgId: string }
  | { kind: 'presence'; orgId: string }
  | { kind: 'channel'; orgId: string; channelId: string }
  | { kind: 'dm'; orgId: string; conversationId: string }
  | { kind: 'user'; orgId: string; userId: string }
  | { kind: 'unknown' };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Parse a channel name for the auth route. The org id is matched against the
 * CALLER's org (it may itself contain '-'), so the parse needs it; anything
 * outside the caller's org is 'unknown' and therefore denied.
 */
export function parseChannel(name: string, callerOrgId: string): ParsedChannel {
  const base = orgChannel(callerOrgId);
  if (name === base) return { kind: 'org', orgId: callerOrgId };
  if (!name.startsWith(`${base}-`)) return { kind: 'unknown' };
  const rest = name.slice(base.length + 1);
  if (rest === 'presence') return { kind: 'presence', orgId: callerOrgId };
  const m = rest.match(new RegExp(`^(channel|dm|user)-(${UUID})$`));
  if (!m) return { kind: 'unknown' };
  const [, kind, id] = m;
  if (kind === 'channel') return { kind, orgId: callerOrgId, channelId: id };
  if (kind === 'dm') return { kind, orgId: callerOrgId, conversationId: id };
  return { kind: 'user', orgId: callerOrgId, userId: id };
}
