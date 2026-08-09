import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { dmConversations, dmMessages, users } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { parseMentions } from '@/lib/claude/mention-parser';
import { runClaudePipeline } from '@/lib/claude/pipeline';
import { sendMentionEmail, sendDmEmail } from '@/lib/email/notifications';
import { rateLimit } from '@/lib/rate-limit';
import { validate, z } from '@/lib/validate';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';

const DmMessageSchema = z.object({
  content: z.string().min(1).max(40_000),
  parentMessageId: z.string().uuid().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const user = await requireUser();
  const { conversationId } = await params;

  const [convo] = await db.select().from(dmConversations)
    .where(and(eq(dmConversations.id, conversationId), sql`${user.id} = ANY(${dmConversations.participantIds})`));

  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const msgs = await db.select().from(dmMessages)
    .where(and(eq(dmMessages.conversationId, conversationId), isNull(dmMessages.deletedAt)))
    .orderBy(asc(dmMessages.createdAt));

  return NextResponse.json(msgs);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const user = await requireUser();
  const { conversationId } = await params;

  if (!rateLimit(`dm:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many messages. Slow down.' }, { status: 429 });
  }

  const parsed_body = validate(DmMessageSchema, await req.json());
  if (!parsed_body.success) return parsed_body.response;
  const body = parsed_body.data;

  const [convo] = await db.select().from(dmConversations)
    .where(and(eq(dmConversations.id, conversationId), sql`${user.id} = ANY(${dmConversations.participantIds})`));

  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Build userMap for @mention resolution
  const orgUsers = await db.select().from(users).where(eq(users.orgId, user.orgId));
  const userMap = Object.fromEntries(orgUsers.map((u) => [u.name.toLowerCase().replace(/\s+/g, ''), u.id]));

  const parsed = parseMentions(body.content, userMap);

  const [message] = await db.insert(dmMessages).values({
    conversationId,
    orgId: user.orgId,
    userId: user.id,
    content: body.content,
    hasClaudeMention: parsed.hasClaude,
  }).returning();

  await pusherServer.trigger(`org-${user.orgId}-dm-${conversationId}`, 'dm.new', { message });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.vb.co';
  const mentionedSet = new Set(parsed.mentionedUserIds);

  // Notify all other conversation participants (fire and forget)
  for (const participantId of (convo.participantIds ?? [])) {
    if (participantId === user.id) continue;
    const recipient = orgUsers.find((u) => u.id === participantId);
    if (!recipient?.email) continue;

    if (mentionedSet.has(participantId)) {
      // Already mentioned — use the richer mention email
      sendMentionEmail({
        channelId: conversationId,
        channelName: 'direct message',
        messageText: body.content,
        senderName: user.name,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        channelUrl: `${appUrl}/dms/${conversationId}`,
      }).catch(() => {});
    } else {
      // Regular DM notification
      sendDmEmail({
        conversationId,
        messageText: body.content,
        senderName: user.name,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        dmUrl: `${appUrl}/dms/${conversationId}`,
      }).catch(() => {});
    }
  }

  if (parsed.hasClaude) {
    runClaudePipeline({
      orgId: user.orgId,
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      channelId: conversationId,
      channelName: 'direct message',
      triggeringMessage: body.content,
      recentMessages: [],
    }).catch((err) => console.error('Claude DM pipeline failed:', err));
  }

  return NextResponse.json(message, { status: 201 });
}
