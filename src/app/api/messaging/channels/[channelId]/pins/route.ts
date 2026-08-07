import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages, users, channelMembers } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, desc } from 'drizzle-orm';

export interface PinnedMessage {
  id: string;
  content: string;
  contentHtml: string | null;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  createdAt: Date | null;
  pinnedAt: Date | null;
  pinnedBy: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await requireUser();
  const { channelId } = await params;

  // Verify membership
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const rows = await db
    .select({
      id: messages.id,
      content: messages.content,
      contentHtml: messages.contentHtml,
      userId: messages.userId,
      createdAt: messages.createdAt,
      pinnedAt: messages.pinnedAt,
      pinnedBy: messages.pinnedBy,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(
      and(
        eq(messages.channelId, channelId),
        eq(messages.isPinned, true),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.pinnedAt))
    .limit(100);

  const pinned: PinnedMessage[] = rows.map((r) => ({
    id: r.id,
    content: r.content,
    contentHtml: r.contentHtml,
    userId: r.userId,
    userName: r.userName,
    userAvatarUrl: r.userAvatarUrl,
    createdAt: r.createdAt,
    pinnedAt: r.pinnedAt,
    pinnedBy: r.pinnedBy,
  }));

  return NextResponse.json(pinned);
}
