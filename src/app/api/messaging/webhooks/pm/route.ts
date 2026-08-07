import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelProjectLinks, messages, channels } from '@/lib/db/schema/messaging';
import { pusherServer } from '@/lib/pusher/server';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.VIBE_WEBHOOK_SECRET ?? '';
const BOT_USER_ID = process.env.CLAUDE_BOT_USER_ID ?? 'claude';
const PM_URL = process.env.NEXT_PUBLIC_PM_URL ?? 'https://pm.vb.co';

function verifySignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // dev mode — skip verification
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function buildMessageContent(event: string, payload: Record<string, unknown>): string {
  const title = payload.title as string ?? 'Untitled';
  const actorName = payload.actorName as string ?? 'Someone';
  const projectId = payload.projectId as string ?? '';
  const comment = payload.comment as string ?? '';
  const priority = payload.priority as string ?? 'normal';
  const link = `[View task](${PM_URL}/projects/${projectId})`;

  switch (event) {
    case 'task.created':
      return `📋 **${title}** was created by ${actorName} · ${priority} priority ${link}`;
    case 'task.completed':
      return `✅ **${title}** was marked complete by ${actorName} ${link}`;
    case 'task.updated':
      return `✏️ **${title}** was updated by ${actorName} ${link}`;
    case 'task.commented':
      const excerpt = comment.length > 100 ? comment.slice(0, 100) + '…' : comment;
      return `💬 ${actorName} commented on **${title}**: ${excerpt} ${link}`;
    default:
      return `📋 Task event: ${event} on **${title}** ${link}`;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-vibe-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, payload } = body as { event: string; payload: Record<string, unknown> };
  if (!event || !payload) {
    return NextResponse.json({ error: 'Missing event or payload' }, { status: 400 });
  }

  const projectId = payload.projectId as string;
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId in payload' }, { status: 400 });
  }

  // Find channels linked to this project
  const links = await db
    .select()
    .from(channelProjectLinks)
    .where(eq(channelProjectLinks.projectId, projectId));

  if (links.length === 0) {
    return NextResponse.json({ ok: true, channelsNotified: 0 });
  }

  // Check if this event type is in the notifyOn list
  const content = buildMessageContent(event, payload);
  let notified = 0;

  for (const link of links) {
    if (!link.channelId) continue;

    // Check notifyOn filter
    const notifyOn = link.notifyOn ?? ['task.created', 'task.completed', 'task.overdue'];
    if (!notifyOn.includes(event)) continue;

    // Fetch channel for orgId
    const [channel] = await db.select().from(channels).where(eq(channels.id, link.channelId));
    if (!channel) continue;

    // Insert bot message
    const [message] = await db
      .insert(messages)
      .values({
        channelId: link.channelId,
        orgId: channel.orgId,
        userId: BOT_USER_ID,
        content,
        isAiResponse: false,
        hasClaudeMention: false,
        metadata: { webhookEvent: event, projectId },
      })
      .returning();

    // Broadcast
    await pusherServer.trigger(
      `org-${channel.orgId}-channel-${link.channelId}`,
      'message.new',
      { message: { ...message, reactions: [] } },
    );

    notified++;
  }

  return NextResponse.json({ ok: true, channelsNotified: notified });
}
