import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channels, channelMembers, messages, users } from '@/lib/db/schema/messaging';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { ChannelView } from './channel-view';

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

  const initialMessages = await db
    .select()
    .from(messages)
    .where(and(eq(messages.channelId, channelId), isNull(messages.parentMessageId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(50)
    .then((rows) => rows.reverse());

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
