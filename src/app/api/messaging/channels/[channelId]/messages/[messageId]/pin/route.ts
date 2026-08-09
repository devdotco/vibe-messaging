import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages, channelMembers } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { eq, and, sql } from 'drizzle-orm';

async function checkPinPermission(channelId: string, userId: string, userRole: string) {
  const isGlobalAdmin = userRole === 'PLATFORM_ADMIN' || userRole === 'ENTITY_ADMIN';
  if (isGlobalAdmin) return true;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)));

  return membership?.role === 'admin' || membership?.role === 'owner';
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string; messageId: string }> },
) {
  const user = await requireUser();
  const { channelId, messageId } = await params;

  const canPin = await checkPinPermission(channelId, user.id, user.role);
  if (!canPin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [updated] = await db
    .update(messages)
    .set({ isPinned: true, pinnedAt: sql`NOW()`, pinnedBy: user.id })
    .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  await pusherServer.trigger(
    `org-${user.orgId}-channel-${channelId}`,
    'message.pinned',
    { messageId },
  );

  // System message: "{User} pinned a message."
  const [sysMsg] = await db.insert(messages).values({
    channelId,
    orgId: user.orgId,
    userId: '00000000-0000-0000-0000-000000000001',
    content: `${user.name} pinned a message.`,
    metadata: { type: 'system', action: 'pin' },
  }).returning();

  await pusherServer.trigger(
    `org-${user.orgId}-channel-${channelId}`,
    'message.new',
    { message: sysMsg },
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string; messageId: string }> },
) {
  const user = await requireUser();
  const { channelId, messageId } = await params;

  const canPin = await checkPinPermission(channelId, user.id, user.role);
  if (!canPin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [updated] = await db
    .update(messages)
    .set({ isPinned: false, pinnedAt: null, pinnedBy: null })
    .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  await pusherServer.trigger(
    `org-${user.orgId}-channel-${channelId}`,
    'message.unpinned',
    { messageId },
  );

  return NextResponse.json({ ok: true });
}
