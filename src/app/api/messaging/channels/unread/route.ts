import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages, channelMembers } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Get all channel memberships for this user
  const memberships = await db
    .select({
      channelId: channelMembers.channelId,
      lastReadAt: channelMembers.lastReadAt,
    })
    .from(channelMembers)
    .where(eq(channelMembers.userId, user.id));

  const unread: Record<string, number> = {};

  for (const membership of memberships) {
    const channelId = membership.channelId;
    let count = 0;

    if (membership.lastReadAt === null) {
      // Never read — count all non-deleted top-level messages
      const [row] = await db
        .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(messages)
        .where(
          and(
            eq(messages.channelId, channelId),
            eq(messages.orgId, user.orgId),
            isNull(messages.parentMessageId),
            isNull(messages.deletedAt),
          ),
        );
      count = row?.count ?? 0;
    } else {
      const [row] = await db
        .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(messages)
        .where(
          and(
            eq(messages.channelId, channelId),
            eq(messages.orgId, user.orgId),
            isNull(messages.parentMessageId),
            isNull(messages.deletedAt),
            gt(messages.createdAt, membership.lastReadAt),
          ),
        );
      count = row?.count ?? 0;
    }

    unread[channelId] = count;
  }

  return NextResponse.json({ unread });
}
