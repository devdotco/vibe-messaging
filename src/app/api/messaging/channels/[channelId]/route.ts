import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channels, channelMembers } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  const [membership] = await db
    .select({ channel: channels })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(membership.channel);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;
  const body = await req.json();

  const [updated] = await db
    .update(channels)
    .set({ name: body.name, description: body.description, claudeEnabled: body.claudeEnabled, updatedAt: new Date() })
    .where(and(eq(channels.id, channelId), eq(channels.orgId, user.orgId)))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  await db.update(channels)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(channels.id, channelId), eq(channels.orgId, user.orgId)));

  return new NextResponse(null, { status: 204 });
}
