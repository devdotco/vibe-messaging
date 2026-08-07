import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { dmConversations, dmMessages, users } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { parseMentions } from '@/lib/claude/mention-parser';
import { runClaudePipeline } from '@/lib/claude/pipeline';
import { sendMentionEmail } from '@/lib/email/notifications';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';

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
  const body = await req.json();

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

  // Email notifications for @mentions in DMs (fire and forget)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.vb.co';
  for (const mentionedId of parsed.mentionedUserIds) {
    if (mentionedId === user.id) continue;
    const mentionedUser = orgUsers.find((u) => u.id === mentionedId);
    if (mentionedUser?.email) {
      sendMentionEmail({
        channelId: conversationId,
        channelName: 'direct message',
        messageText: body.content,
        senderName: user.name,
        recipientEmail: mentionedUser.email,
        recipientName: mentionedUser.name,
        channelUrl: `${appUrl}/dms/${conversationId}`,
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
