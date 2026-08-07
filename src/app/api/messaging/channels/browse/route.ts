import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channels, channelMembers } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq, and, not, inArray, sql } from 'drizzle-orm';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Channels the user is already a member of
  const memberChannelRows = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, user.id));

  const memberChannelIds = memberChannelRows.map((r) => r.channelId);

  // All non-archived public channels in the org the user is NOT a member of
  const baseConditions = [
    eq(channels.orgId, user.orgId),
    eq(channels.isArchived, false),
    eq(channels.type, 'public'),
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

  return NextResponse.json(browseChannels);
}
