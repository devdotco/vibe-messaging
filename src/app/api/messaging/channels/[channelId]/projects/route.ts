import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelProjectLinks, channelMembers } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const links = await db
    .select()
    .from(channelProjectLinks)
    .where(and(eq(channelProjectLinks.channelId, channelId), eq(channelProjectLinks.orgId, user.orgId)));

  return NextResponse.json(links);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  // Must be admin
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  const isAdmin =
    membership?.role === 'admin' || membership?.role === 'owner' ||
    user.role === 'PLATFORM_ADMIN' || user.role === 'ENTITY_ADMIN';

  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { projectId, notifyOn } = await req.json();
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  const [link] = await db
    .insert(channelProjectLinks)
    .values({
      orgId: user.orgId,
      channelId,
      projectId,
      notifyOn: notifyOn ?? ['task.created', 'task.completed', 'task.overdue'],
    })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  const isAdmin =
    membership?.role === 'admin' || membership?.role === 'owner' ||
    user.role === 'PLATFORM_ADMIN' || user.role === 'ENTITY_ADMIN';

  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { projectId } = await req.json();
  await db
    .delete(channelProjectLinks)
    .where(
      and(
        eq(channelProjectLinks.channelId, channelId),
        eq(channelProjectLinks.projectId, projectId),
        eq(channelProjectLinks.orgId, user.orgId),
      ),
    );

  return new NextResponse(null, { status: 204 });
}
