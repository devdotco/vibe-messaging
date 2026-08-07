import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { dmConversations, dmMessages } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { parseMentions } from '@/lib/claude/mention-parser';
import { runClaudePipeline } from '@/lib/claude/pipeline';
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

  const parsed = parseMentions(body.content, {});

  const [message] = await db.insert(dmMessages).values({
    conversationId,
    orgId: user.orgId,
    userId: user.id,
    content: body.content,
    hasClaudeMention: parsed.hasClaude,
  }).returning();

  await pusherServer.trigger(`org-${user.orgId}-dm-${conversationId}`, 'dm.new', { message });

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
