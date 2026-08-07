import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channels } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { channelId } = await params;
  const body = await req.json();

  const updates: Partial<{
    name: string;
    description: string | null;
    claudeEnabled: boolean;
    isArchived: boolean;
  }> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.claudeEnabled !== undefined) updates.claudeEnabled = body.claudeEnabled;
  if (body.isArchived !== undefined) updates.isArchived = body.isArchived;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(channels)
    .set(updates)
    .where(eq(channels.id, channelId))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { channelId } = await params;

  const [updated] = await db
    .update(channels)
    .set({ isArchived: true })
    .where(eq(channels.id, channelId))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
