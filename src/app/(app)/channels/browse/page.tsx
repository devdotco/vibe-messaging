import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channels, channelMembers } from '@/lib/db/schema/messaging';
import { eq, and, not, inArray, sql } from 'drizzle-orm';
import { BrowseChannelsClient } from './browse-channels-client';

export default async function BrowseChannelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  // Channels the user is already a member of
  const memberRows = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, user.id));

  const memberChannelIds = memberRows.map((r) => r.channelId);

  const baseConditions = [
    eq(channels.orgId, user.orgId),
    eq(channels.isArchived, false),
  ];

  const browseChannels =
    memberChannelIds.length > 0
      ? await db
          .select({
            id: channels.id,
            name: channels.name,
            description: channels.description,
            type: channels.type,
            isDefault: channels.isDefault,
            createdAt: channels.createdAt,
            memberCount: sql<number>`(
              SELECT COUNT(*) FROM channel_members
              WHERE channel_members.channel_id = ${channels.id}
            )`.mapWith(Number),
          })
          .from(channels)
          .where(and(...baseConditions, not(inArray(channels.id, memberChannelIds))))
      : await db
          .select({
            id: channels.id,
            name: channels.name,
            description: channels.description,
            type: channels.type,
            isDefault: channels.isDefault,
            createdAt: channels.createdAt,
            memberCount: sql<number>`(
              SELECT COUNT(*) FROM channel_members
              WHERE channel_members.channel_id = ${channels.id}
            )`.mapWith(Number),
          })
          .from(channels)
          .where(and(...baseConditions));

  return <BrowseChannelsClient channels={browseChannels} />;
}
