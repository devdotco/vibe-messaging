import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messageReactions, messages } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { eq, and } from 'drizzle-orm';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ messageId: string; emoji: string }> }) {
  const user = await requireUser();
  const { messageId, emoji } = await params;

  await db.delete(messageReactions).where(
    and(
      eq(messageReactions.messageId, messageId),
      eq(messageReactions.userId, user.id),
      eq(messageReactions.emoji, decodeURIComponent(emoji)),
    ),
  );

  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (msg) {
    await pusherServer.trigger(
      `org-${user.orgId}-channel-${msg.channelId}`,
      'message.reaction',
      { messageId, emoji: decodeURIComponent(emoji), userId: user.id, action: 'remove' },
    );
  }

  return new NextResponse(null, { status: 204 });
}
