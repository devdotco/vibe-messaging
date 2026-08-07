import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  channels, channelMembers, messages, notifications, users,
} from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { parseMentions } from '@/lib/claude/mention-parser';
import { runClaudePipeline } from '@/lib/claude/pipeline';
import { eq, and, isNull, lt, desc, sql } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;
  const { searchParams } = new URL(req.url);
  const before = searchParams.get('before');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const conditions = [
    eq(messages.channelId, channelId),
    eq(messages.orgId, user.orgId),
    isNull(messages.parentMessageId),
    isNull(messages.deletedAt),
  ];

  if (before) {
    conditions.push(lt(messages.createdAt, new Date(before)));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Mark channel as read for this user
  await db
    .update(channelMembers)
    .set({ lastReadAt: sql`NOW()` })
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  return NextResponse.json(rows.reverse());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;
  const body = await req.json();

  // 1. Verify channel membership
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // 2. Fetch channel for claude_enabled check
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId));

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // 3. Build user map for @mention parsing
  const orgUsers = await db.select().from(users).where(eq(users.orgId, user.orgId));
  const userMap = Object.fromEntries(orgUsers.map((u) => [u.name.toLowerCase().replace(/\s+/g, ''), u.id]));

  const parsed = parseMentions(body.content, userMap);

  // 4. Save message
  const [message] = await db
    .insert(messages)
    .values({
      channelId,
      orgId: user.orgId,
      userId: user.id,
      content: body.content,
      parentMessageId: body.parentMessageId ?? null,
      hasClaudeMention: parsed.hasClaude,
      mentions: parsed.mentionedUserIds,
    })
    .returning();

  // 5. Broadcast to channel
  await pusherServer.trigger(`org-${user.orgId}-channel-${channelId}`, 'message.new', { message });

  // 6. Create @mention notifications
  for (const mentionedId of parsed.mentionedUserIds) {
    await db.insert(notifications).values({
      userId: mentionedId,
      orgId: user.orgId,
      type: 'mention',
      channelId,
      messageId: message.id,
      triggeredByUserId: user.id,
    });
    await pusherServer.trigger(
      `org-${user.orgId}-user-${mentionedId}`,
      'notification.new',
      { type: 'mention', channelId, messageId: message.id },
    );
  }

  // 7. Fire Claude pipeline without awaiting (non-blocking)
  if (parsed.hasClaude && channel.claudeEnabled) {
    const recentRows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.channelId, channelId), isNull(messages.parentMessageId), isNull(messages.deletedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(10);

    const recentMessages = recentRows.reverse().map((m) => ({
      role: (m.isAiResponse ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
      userName: orgUsers.find((u) => u.id === m.userId)?.name ?? 'User',
    }));

    runClaudePipeline({
      orgId: user.orgId,
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      channelId,
      channelName: channel.name,
      parentMessageId: body.parentMessageId,
      triggeringMessage: body.content,
      recentMessages,
    }).catch((err) => console.error('Claude pipeline failed:', err));
  }

  return NextResponse.json(message, { status: 201 });
}
