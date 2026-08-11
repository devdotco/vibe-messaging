import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, sessions, channelMembers, notifications, userPresence } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await params;
  const body = await req.json();
  const updates: Partial<{ role: string; status: string }> = {};
  if (body.role !== undefined) updates.role = body.role;
  if (body.status !== undefined) updates.status = body.status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();

  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await params;

  if (userId === currentUser.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  // Clean up related rows before deleting the user
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(channelMembers).where(eq(channelMembers.userId, userId));
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db.delete(userPresence).where(eq(userPresence.userId, userId));

  const [deleted] = await db.delete(users).where(eq(users.id, userId)).returning();
  if (!deleted) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
