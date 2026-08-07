import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  channels, channelMembers, users, dmConversations,
  userPresence, messages, workspaces, notifications,
} from '@/lib/db/schema/messaging';
import { eq, and, gt, isNull, sql, desc } from 'drizzle-orm';
import { Sidebar, type DmEntry } from '@/components/layout/sidebar';
import { PresenceUpdater } from '@/components/messaging/presence-updater';
import { SidebarPresenceSync } from '@/components/messaging/sidebar-presence-sync';
import { AppSwitcher } from '@/components/layout/app-switcher';
import { AppLayoutClient } from './layout-client';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const memberships = await db
    .select({ channel: channels, lastReadAt: channelMembers.lastReadAt })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(and(eq(channelMembers.userId, user.id), eq(channels.isArchived, false)));

  const userChannels = memberships.map((m) => m.channel);

  // Compute unread counts
  const unreadCounts: Record<string, number> = {};
  for (const membership of memberships) {
    const channelId = membership.channel.id;
    const lastReadAt = membership.lastReadAt;

    const conditions = [
      eq(messages.channelId, channelId),
      eq(messages.orgId, user.orgId),
      isNull(messages.parentMessageId),
      isNull(messages.deletedAt),
    ];
    if (lastReadAt) {
      conditions.push(gt(messages.createdAt, lastReadAt));
    }

    const [row] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(messages)
      .where(and(...conditions));

    unreadCounts[channelId] = row?.count ?? 0;
  }

  // DM conversations — include conversation ID so sidebar can navigate directly
  const convos = await db
    .select()
    .from(dmConversations)
    .where(and(eq(dmConversations.orgId, user.orgId), sql`${user.id} = ANY(${dmConversations.participantIds})`))
    .orderBy(desc(dmConversations.createdAt));

  const otherUserMap: Record<string, string> = {};
  for (const c of convos) {
    const otherId = (c.participantIds ?? []).find((id) => id !== user.id);
    if (otherId) otherUserMap[otherId] = c.id;
  }

  const uniqueOtherIds = Object.keys(otherUserMap);

  const otherUsers = uniqueOtherIds.length > 0
    ? await db.select({ user: users, presence: userPresence })
        .from(users)
        .leftJoin(userPresence, eq(userPresence.userId, users.id))
        .where(sql`${users.id} = ANY(${uniqueOtherIds})`)
    : [];

  const dmList: DmEntry[] = otherUsers.map(({ user: u, presence }) => ({
    conversationId: otherUserMap[u.id] ?? '',
    userId: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl,
    presence: presence?.status ?? 'offline',
    statusMessage: presence?.statusMessage,
  }));

  // Workspace name
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.orgId, user.orgId))
    .limit(1);

  const workspaceName = workspace?.name ?? 'My Workspace';

  // Unread notification count
  const [notifRow] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

  const notificationCount = notifRow?.count ?? 0;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppSwitcher />
      <AppLayoutClient
        channels={userChannels}
        dms={dmList}
        currentUser={user}
        workspaceName={workspaceName}
        unreadCounts={unreadCounts}
        notificationCount={notificationCount}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <PresenceUpdater />
        <SidebarPresenceSync orgId={user.orgId} />
        {children}
      </main>
    </div>
  );
}
