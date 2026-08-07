import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const user = await requireUser();
  const { messageId } = await params;
  const { content } = await req.json();

  const [updated] = await db
    .update(messages)
    .set({ content, editedAt: new Date() })
    .where(and(eq(messages.id, messageId), eq(messages.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await pusherServer.trigger(
    `org-${user.orgId}-channel-${updated.channelId}`,
    'message.updated',
    { messageId, content },
  );

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const user = await requireUser();
  const { messageId } = await params;

  const [deleted] = await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(and(eq(messages.id, messageId), eq(messages.userId, user.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await pusherServer.trigger(
    `org-${user.orgId}-channel-${deleted.channelId}`,
    'message.deleted',
    { messageId },
  );

  return new NextResponse(null, { status: 204 });
}
