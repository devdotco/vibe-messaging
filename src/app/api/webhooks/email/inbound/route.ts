import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages, channels, users, dmMessages, dmConversations } from '@/lib/db/schema/messaging';
import { eq, and } from 'drizzle-orm';
import { verifyReplyAddress, stripQuotedReply } from '@/lib/email/notifications';
import { pusherServer } from '@/lib/pusher/server';

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const from = form.get('from') as string ?? '';
  // Support both SendGrid (envelope JSON + to) and Mailgun (recipient field)
  const rawEnvelope = form.get('envelope') as string ?? '{}';
  const envelope = JSON.parse(rawEnvelope);
  const to = (
    envelope.to?.[0] ??
    form.get('to') as string ??
    form.get('recipient') as string ?? // Mailgun
    ''
  ).trim();
  // Support both SendGrid (text) and Mailgun (stripped-text / body-plain)
  const text = (
    form.get('text') as string ||
    form.get('stripped-text') as string ||
    form.get('body-plain') as string ||
    ''
  );

  console.log('[inbound]', { from, to: to.slice(0, 60), textLen: text.length });

  // Proxy task/project types to PM BEFORE any local verification —
  // messaging's TYPE_DECODE only knows c/d, so HMAC would fail on t/p.
  const typeCode = to.match(/reply\+([a-z])-/)?.[1];
  if (typeCode === 't' || typeCode === 'p') {
    await fetch('https://pm.vb.co/api/webhooks/email/inbound', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.EMAIL_REPLY_SECRET ?? '',
      },
      body: JSON.stringify({ from, to, text }),
    }).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  const fromEmailMatch = from.match(/<([^>]+)>/) ?? from.match(/(\S+@\S+)/);
  const fromEmail = (fromEmailMatch ? fromEmailMatch[1] : from)!;

  const parsed = verifyReplyAddress(to, fromEmail);
  if (!parsed) {
    console.error('[inbound] verifyReplyAddress failed', { to, fromEmail });
    return NextResponse.json({ error: 'Invalid reply address' }, { status: 400 });
  }

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
