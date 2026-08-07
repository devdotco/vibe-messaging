import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channels, channelMembers, users, dmConversations, userPresence, messages } from '@/lib/db/schema/messaging';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import { Sidebar } from '@/components/layout/sidebar';
import { PresenceUpdater } from '@/components/messaging/presence-updater';

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
      eq(messages.orgId, user.id ? user.orgId : ''),
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

  // DM conversations — fetch other participants
  const convos = await db
    .select()
    .from(dmConversations)
    .where(and(eq(dmConversations.orgId, user.orgId), sql`${user.id} = ANY(${dmConversations.participantIds})`));

  const otherUserIds = convos.flatMap((c) => (c.participantIds ?? []).filter((id) => id !== user.id));
  const uniqueOtherIds = [...new Set(otherUserIds)];

  const otherUsers = uniqueOtherIds.length > 0
    ? await db.select({ user: users, presence: userPresence })
        .from(users)
        .leftJoin(userPresence, eq(userPresence.userId, users.id))
        .where(sql`${users.id} = ANY(${uniqueOtherIds})`)
    : [];

  const dmList = otherUsers.map(({ user: u, presence }) => ({
    userId: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl,
    presence: presence?.status ?? 'offline',
  }));

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar channels={userChannels} dms={dmList} currentUser={user} unreadCounts={unreadCounts} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <PresenceUpdater />
        {children}
      </main>
    </div>
  );
}
