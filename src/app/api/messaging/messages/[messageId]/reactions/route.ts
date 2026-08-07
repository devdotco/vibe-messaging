import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messageReactions, messages } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const user = await requireUser();
  const { messageId } = await params;
  const { emoji } = await req.json();

  await db.insert(messageReactions)
    .values({ messageId, orgId: user.orgId, userId: user.id, emoji })
    .onConflictDoNothing();

  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (msg) {
    await pusherServer.trigger(
      `org-${user.orgId}-channel-${msg.channelId}`,
      'message.reaction',
      { messageId, emoji, userId: user.id, action: 'add' },
    );
  }

  return NextResponse.json({ ok: true });
}
