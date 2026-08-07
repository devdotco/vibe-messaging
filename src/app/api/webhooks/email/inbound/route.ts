import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages, channels, users, dmMessages, dmConversations } from '@/lib/db/schema/messaging';
import { eq, and } from 'drizzle-orm';
import { verifyReplyAddress, stripQuotedReply } from '@/lib/email/notifications';
import { pusherServer } from '@/lib/pusher/server';
import crypto from 'crypto';

function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const key = process.env.MAILGUN_WEBHOOK_KEY ?? '';
  const expected = crypto.createHmac('sha256', key)
    .update(timestamp + token)
    .digest('hex');
  return expected === signature;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const timestamp = form.get('timestamp') as string ?? '';
  const token = form.get('token') as string ?? '';
  const signature = form.get('signature') as string ?? '';

  if (process.env.MAILGUN_WEBHOOK_KEY && !verifyMailgunSignature(timestamp, token, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const from = form.get('sender') as string ?? form.get('from') as string ?? '';
  const to = (form.get('recipient') as string ?? form.get('To') as string ?? '').split(',')[0]!.trim();
  const text = form.get('body-plain') as string ?? '';

  const fromEmailMatch = from.match(/<([^>]+)>/) ?? from.match(/(\S+@\S+)/);
  const fromEmail = (fromEmailMatch ? fromEmailMatch[1] : from)!;

  const parsed = verifyReplyAddress(to, fromEmail);
  if (!parsed) return NextResponse.json({ error: 'Invalid reply address' }, { status: 400 });

  const { type, entityId } = parsed;
  const replyText = stripQuotedReply(text);
  if (!replyText || replyText.length < 2) return NextResponse.json({ ok: true });

  if (type === 'channel') {
    const channelId = entityId;

    // Find the channel and get orgId
    const [channel] = await db.select().from(channels)
      .where(eq(channels.id, channelId)).limit(1);
    if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    // Find or create user by email
    let [user] = await db.select().from(users)
      .where(and(eq(users.orgId, channel.orgId), eq(users.email, fromEmail))).limit(1);
    if (!user) {
      const name = from.replace(/<[^>]+>/, '').trim() || fromEmail.split('@')[0]!;
      [user] = await db.insert(users).values({
        orgId: channel.orgId,
        email: fromEmail,
        name,
        status: 'active',
      }).returning();
    }

    // Insert message and broadcast via Pusher
    const [message] = await db.insert(messages).values({
      channelId,
      orgId: channel.orgId,
      userId: user!.id,
      content: replyText,
      source: 'email',
    }).returning();

    await pusherServer.trigger(
      `org-${channel.orgId}-channel-${channelId}`,
      'message.new',
      { message: { ...message, reactions: [] } },
    );

    return NextResponse.json({ ok: true });
  }

  if (type === 'dm') {
    const conversationId = entityId;

    const [convo] = await db.select().from(dmConversations)
      .where(eq(dmConversations.id, conversationId)).limit(1);
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    let [user] = await db.select().from(users)
      .where(and(eq(users.orgId, convo.orgId), eq(users.email, fromEmail))).limit(1);
    if (!user) {
      const name = from.replace(/<[^>]+>/, '').trim() || fromEmail.split('@')[0]!;
      [user] = await db.insert(users).values({
        orgId: convo.orgId,
        email: fromEmail,
        name,
        status: 'active',
      }).returning();
    }

    const [dmMessage] = await db.insert(dmMessages).values({
      conversationId,
      orgId: convo.orgId,
      userId: user!.id,
      content: replyText,
    }).returning();

    await pusherServer.trigger(
      `org-${convo.orgId}-dm-${conversationId}`,
      'dm.new',
      { message: dmMessage },
    );

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
