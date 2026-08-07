import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messageTaskLinks, messages } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const user = await requireUser();
  const { messageId } = await params;
  const body = await req.json();

  const [link] = await db.insert(messageTaskLinks).values({
    orgId: user.orgId,
    messageId,
    taskId: body.taskId,
    createdBy: user.id,
  }).returning();

  // Post system message in the channel
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (msg) {
    const [systemMsg] = await db.insert(messages).values({
      channelId: msg.channelId,
      orgId: user.orgId,
      userId: user.id,
      content: `📋 Task created: **${body.taskTitle ?? 'Untitled'}**`,
      metadata: { system: true, taskId: body.taskId },
    }).returning();

    await pusherServer.trigger(
      `org-${user.orgId}-channel-${msg.channelId}`,
      'message.new',
      { message: systemMsg },
    );
  }

  return NextResponse.json(link, { status: 201 });
}
