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

async function getChannelMemberRole(channelId: string, userId: string, userOrgRole: string): Promise<boolean> {
  if (userOrgRole === 'PLATFORM_ADMIN' || userOrgRole === 'ENTITY_ADMIN') return true;
  const [m] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)));
  return m?.role === 'admin' || m?.role === 'owner';
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  const isAdmin = await getChannelMemberRole(channelId, user.id, user.role);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });

  const body = await req.json();

  const [updated] = await db
    .update(channels)
    .set({
      name: body.name,
      description: body.description,
      claudeEnabled: body.claudeEnabled,
      type: body.type,
      isArchived: body.isArchived,
      updatedAt: new Date(),
    })
    .where(and(eq(channels.id, channelId), eq(channels.orgId, user.orgId)))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  const isAdmin = await getChannelMemberRole(channelId, user.id, user.role);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });

  await db.update(channels)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(channels.id, channelId), eq(channels.orgId, user.orgId)));

  return new NextResponse(null, { status: 204 });
}
