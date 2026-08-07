import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channels, channelMembers, messages, messageReactions, users } from '@/lib/db/schema/messaging';
import { eq, and, isNull, desc, inArray } from 'drizzle-orm';
import { ChannelView } from './channel-view';
import type { MessageWithReactions } from '@/components/messaging/message-item';
import type { ReactionGroup } from '@/app/api/messaging/channels/[channelId]/messages/route';

function groupReactions(rows: (typeof messageReactions.$inferSelect)[]): ReactionGroup[] {
  const map: Record<string, ReactionGroup> = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
    map[r.emoji].count++;
    map[r.emoji].userIds.push(r.userId);
  }
  return Object.values(map);
}

export default async function ChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const { channelId } = await params;

  const [membership] = await db
    .select({ channel: channels })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  if (!membership) notFound();

  const rawMessages = await db
    .select()
    .from(messages)
    .where(and(eq(messages.channelId, channelId), isNull(messages.parentMessageId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(50)
    .then((rows) => rows.reverse());

  // Batch-fetch reactions
  const messageIds = rawMessages.map((m) => m.id);
  const allReactions = messageIds.length > 0
    ? await db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds))
    : [];
  const reactionsByMessage: Record<string, typeof allReactions> = {};
  for (const r of allReactions) {
    if (!reactionsByMessage[r.messageId]) reactionsByMessage[r.messageId] = [];
    reactionsByMessage[r.messageId].push(r);
  }

  const initialMessages: MessageWithReactions[] = rawMessages.map((m) => ({
    ...m,
    reactions: groupReactions(reactionsByMessage[m.id] ?? []),
  }));

  const memberRows = await db
    .select({ user: users })
    .from(channelMembers)
    .innerJoin(users, eq(channelMembers.userId, users.id))
    .where(eq(channelMembers.channelId, channelId));

  const usersMap = Object.fromEntries(memberRows.map((r) => [r.user.id, r.user]));

  return (
    <ChannelView
      channel={membership.channel}
      initialMessages={initialMessages}
      usersMap={usersMap}
      currentUser={user}
      memberCount={memberRows.length}
    />
  );
}
