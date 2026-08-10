import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  channels, channelMembers, messages, messageReactions, messageAttachments, notifications, users,
} from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { parseMentions } from '@/lib/claude/mention-parser';
import { runClaudePipeline } from '@/lib/claude/pipeline';
import { sendMentionEmail } from '@/lib/email/notifications';
import { rateLimit } from '@/lib/rate-limit';
import { validate, z } from '@/lib/validate';
import { eq, and, isNull, lt, desc, sql, inArray } from 'drizzle-orm';
import { micromark } from 'micromark';

const AttachmentSchema = z.object({
  url: z.string().min(1),
  filename: z.string().min(1),
  fileType: z.string().min(1),
  size: z.number().optional(),
});

const MessageSchema = z.object({
  content: z.string().min(0).max(40_000),
  parentMessageId: z.string().uuid().optional(),
  forwardedFromMessageId: z.string().uuid().optional(),
  forwardedFromChannelId: z.string().uuid().optional(),
  attachments: z.array(AttachmentSchema).max(10).optional(),
});

export type ReactionGroup = { emoji: string; count: number; userIds: string[] };
export type AttachmentRow = { id: string; url: string; filename: string; fileType: string; fileSize: number | null };
export type MessageWithReactions = typeof messages.$inferSelect & { reactions: ReactionGroup[]; attachments: AttachmentRow[] };

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

  const allAttachmentsRows = messageIds.length > 0
    ? await db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, messageIds))
    : [];

  const reactionsByMessage: Record<string, typeof allReactions> = {};
  for (const r of allReactions) {
    if (!reactionsByMessage[r.messageId]) reactionsByMessage[r.messageId] = [];
    reactionsByMessage[r.messageId].push(r);
  }

  const attachmentsByMessage: Record<string, AttachmentRow[]> = {};
  for (const a of allAttachmentsRows) {
    if (!attachmentsByMessage[a.messageId]) attachmentsByMessage[a.messageId] = [];
    attachmentsByMessage[a.messageId].push({ id: a.id, url: a.url, filename: a.filename, fileType: a.fileType, fileSize: a.fileSize });
  }

  const messagesWithReactions: MessageWithReactions[] = pageRows.reverse().map((msg) => ({
    ...msg,
    reactions: groupReactions(reactionsByMessage[msg.id] ?? []),
    attachments: attachmentsByMessage[msg.id] ?? [],
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

  if (!rateLimit(`msg:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many messages. Slow down.' }, { status: 429 });
  }

  const parsed_body = validate(MessageSchema, await req.json());
  if (!parsed_body.success) return parsed_body.response;
  const body = parsed_body.data;

  if (!body.content.trim() && (!body.attachments || body.attachments.length === 0)) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }

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

  if (parsed.hasClaude && !rateLimit(`claude:${user.id}`, 10, 3_600_000)) {
    return NextResponse.json(
      { error: 'Claude usage limit reached. Try again in an hour.' },
      { status: 429 },
    );
  }

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
      hasHereMention: parsed.hasHere,
      hasChannelMention: parsed.hasChannel,
      mentions: parsed.mentionedUserIds,
      forwardedFromMessageId: body.forwardedFromMessageId ?? null,
      forwardedFromChannelId: body.forwardedFromChannelId ?? null,
    })
    .returning();

  // 7. If this is a reply, increment parent threadReplyCount and broadcast
  if (body.parentMessageId) {
    const threadLastReplyAt = new Date();
    const [updatedParent] = await db
      .update(messages)
      .set({
        threadReplyCount: sql`${messages.threadReplyCount} + 1`,
        threadLastReplyAt,
      })
      .where(eq(messages.id, body.parentMessageId))
      .returning({ threadReplyCount: messages.threadReplyCount });

    pusherServer.trigger(`org-${user.orgId}-channel-${channelId}`, 'thread.reply', {
      parentId: body.parentMessageId,
      threadReplyCount: updatedParent?.threadReplyCount ?? 1,
      threadLastReplyAt: threadLastReplyAt.toISOString(),
    }).catch(() => {});
  }

  // 8. Save attachments
  let savedAttachments: AttachmentRow[] = [];
  if (body.attachments?.length) {
    const inserted = await db.insert(messageAttachments).values(
      body.attachments.map((a) => ({
        messageId: message.id,
        orgId: user.orgId,
        url: a.url,
        filename: a.filename,
        fileType: a.fileType,
        fileSize: a.size ?? null,
      }))
    ).returning();
    savedAttachments = inserted.map((a) => ({ id: a.id, url: a.url, filename: a.filename, fileType: a.fileType, fileSize: a.fileSize }));
  }

  // 9. Broadcast to channel
  const messageWithReactions: MessageWithReactions = { ...message, reactions: [], attachments: savedAttachments };
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
      const notifEmail = mentionedUser?.personalEmail ?? mentionedUser?.email;
      if (notifEmail) {
        sendMentionEmail({
          channelId,
          channelName: channel.name,
          messageText: body.content,
          senderName: user.name,
          recipientEmail: notifEmail,
          recipientName: mentionedUser!.name,
          channelUrl: `${appUrl}/channels/${channelId}`,
        }).catch(() => {});
      }
    }
  }

  // 10. @here — notify online channel members
  if (parsed.hasHere) {
    const onlineMembers = await db
      .select({ userId: channelMembers.userId })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, channelId));
    for (const { userId: memberId } of onlineMembers) {
      if (memberId === user.id) continue;
      await db.insert(notifications).values({
        userId: memberId,
        orgId: user.orgId,
        type: 'here_mention',
        channelId,
        messageId: message.id,
        triggeredByUserId: user.id,
      }).onConflictDoNothing();
      pusherServer.trigger(
        `org-${user.orgId}-user-${memberId}`,
        'notification.new',
        { type: 'here_mention', channelId, messageId: message.id },
      ).catch(() => {});
    }
  }

  // @channel — notify all channel members
  if (parsed.hasChannel) {
    const allMembers = await db
      .select({ userId: channelMembers.userId })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, channelId));
    for (const { userId: memberId } of allMembers) {
      if (memberId === user.id) continue;
      await db.insert(notifications).values({
        userId: memberId,
        orgId: user.orgId,
        type: 'channel_mention',
        channelId,
        messageId: message.id,
        triggeredByUserId: user.id,
      }).onConflictDoNothing();
      pusherServer.trigger(
        `org-${user.orgId}-user-${memberId}`,
        'notification.new',
        { type: 'channel_mention', channelId, messageId: message.id },
      ).catch(() => {});
    }
  }

  // 11. Fire Claude pipeline without awaiting (non-blocking)
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
