import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelProjectLinks, messages } from '@/lib/db/schema/messaging';
import { pusherServer } from '@/lib/pusher/server';
import { eq, and } from 'drizzle-orm';

const EVENT_TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
  'task.created': (d) => `📋 New task: **${d.taskTitle}** assigned to ${d.assignee}`,
  'task.completed': (d) => `✅ Task completed: **${d.taskTitle}** by ${d.completedBy}`,
  'task.overdue': (d) => `⚠️ Overdue: **${d.taskTitle}** was due ${d.dueDate}`,
  'milestone.reached': (d) => `🎯 Milestone reached: **${d.milestoneName}**`,
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { orgId, projectId, eventType, data } = body;

  const template = EVENT_TEMPLATES[eventType];
  if (!template) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });

  const links = await db
    .select()
    .from(channelProjectLinks)
    .where(and(eq(channelProjectLinks.projectId, projectId), eq(channelProjectLinks.orgId, orgId)));

  for (const link of links) {
    if (!link.notifyOn?.includes(eventType)) continue;
    if (!link.channelId) continue;

    const content = template(data);
    const [msg] = await db.insert(messages).values({
      channelId: link.channelId,
      orgId,
      userId: '00000000-0000-0000-0000-000000000001', // system user
      content,
      metadata: { system: true, pmEvent: eventType },
    }).returning();

    await pusherServer.trigger(`org-${orgId}-channel-${link.channelId}`, 'message.new', { message: msg });
  }

  return NextResponse.json({ ok: true });
}
