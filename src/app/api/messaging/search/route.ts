import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages, channels, channelMembers } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, ilike, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  if (!q || q.length < 2) return NextResponse.json([]);

  // Only search channels the user belongs to
  const memberships = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(and(eq(channelMembers.userId, user.id), eq(channelMembers.orgId, user.orgId)));

  const channelIds = memberships.map((m) => m.channelId);
  if (channelIds.length === 0) return NextResponse.json([]);

  const results = await db
    .select({ message: messages, channel: channels })
    .from(messages)
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(
      and(
        inArray(messages.channelId, channelIds),
        eq(messages.orgId, user.orgId),
        isNull(messages.deletedAt),
        ilike(messages.content, `%${q}%`),
      ),
    )
    .limit(30);

  return NextResponse.json(results);
}
