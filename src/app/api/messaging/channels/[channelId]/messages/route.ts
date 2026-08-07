import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  channels, channelMembers, messages, messageReactions, notifications, users,
} from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { parseMentions } from '@/lib/claude/mention-parser';
import { runClaudePipeline } from '@/lib/claude/pipeline';
import { sendMentionEmail } from '@/lib/email/notifications';
import { eq, and, isNull, lt, desc, sql, inArray } from 'drizzle-orm';
import { micromark } from 'micromark';

export type ReactionGroup = { emoji: string; count: number; userIds: string[] };
export type MessageWithReactions = typeof messages.$inferSelect & { reactions: ReactionGroup[] };

function groupReactions(rows: (typeof messageReactions.$inferSelect)[]): ReactionGroup[] {
  const map: Record<string, ReactionGroup> = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
    map[r.emoji].count++;
    map[r.emoji].userIds.push(r.userId);
  }
  return Object.values(map);
}

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
    .limit(limit + 1); // fetch one extra to determine hasMore

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // Batch-fetch reactions for all messages
  const messageIds = pageRows.map((m) => m.id);
  const allReactions = messageIds.length > 0
    ? await db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds))
    : [];

  const reactionsByMessage: Record<string, typeof allReactions> = {};
  for (const r of allReactions) {
    if (!reactionsByMessage[r.messageId]) reactionsByMessage[r.messageId] = [];
    reactionsByMessage[r.messageId].push(r);
  }

  const messagesWithReactions: MessageWithReactions[] = pageRows.reverse().map((msg) => ({
    ...msg,
    reactions: groupReactions(reactionsByMessage[msg.id] ?? []),
  }));

  // Mark channel as read for this user
  await db
    .update(channelMembers)
    .set({ lastReadAt: sql`NOW()` })
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  return NextResponse.json({ messages: messagesWithReactions, hasMore });
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

  // 2. Fetch channel for claude_enabled + announcement check
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId));

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // 3. Announcement channel — only admins may post
  if (channel.type === 'announcement') {
    const isAdmin =
      membership.role === 'admin' || membership.role === 'owner' ||
      user.role === 'PLATFORM_ADMIN' || user.role === 'ENTITY_ADMIN';
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only admins can post in announcement channels' }, { status: 403 });
    }
  }

  // 4. Build user map for @mention parsing
  const orgUsers = await db.select().from(users).where(eq(users.orgId, user.orgId));
  const userMap = Object.fromEntries(orgUsers.map((u) => [u.name.toLowerCase().replace(/\s+/g, ''), u.id]));

  const parsed = parseMentions(body.content, userMap);

  // 5. Generate contentHtml from markdown
  const contentHtml = micromark(body.content);

  // 6. Save message
  const [message] = await db
    .insert(messages)
    .values({
      channelId,
      orgId: user.orgId,
      userId: user.id,
      content: body.content,
      contentHtml,
      parentMessageId: body.parentMessageId ?? null,
      hasClaudeMention: parsed.hasClaude,
      mentions: parsed.mentionedUserIds,
    })
    .returning();

  // 7. If this is a reply, increment parent threadReplyCount
  if (body.parentMessageId) {
    await db
      .update(messages)
      .set({
        threadReplyCount: sql`${messages.threadReplyCount} + 1`,
        threadLastReplyAt: new Date(),
      })
      .where(eq(messages.id, body.parentMessageId));
  }

  // 8. Broadcast to channel
  const messageWithReactions: MessageWithReactions = { ...message, reactions: [] };
  await pusherServer.trigger(`org-${user.orgId}-channel-${channelId}`, 'message.new', { message: messageWithReactions });

  // 9. Create @mention notifications + email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.vb.co';
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
    // Email notification (fire and forget — skip self-mentions)
    if (mentionedId !== user.id) {
      const mentionedUser = orgUsers.find((u) => u.id === mentionedId);
      if (mentionedUser?.email) {
        sendMentionEmail({
          channelId,
          channelName: channel.name,
          messageText: body.content,
          senderName: user.name,
          recipientEmail: mentionedUser.email,
          recipientName: mentionedUser.name,
          channelUrl: `${appUrl}/channels/${channelId}`,
        }).catch(() => {});
      }
    }
  }

  // 10. Fire Claude pipeline without awaiting (non-blocking)
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

  return NextResponse.json(messageWithReactions, { status: 201 });
}
