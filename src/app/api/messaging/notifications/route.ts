import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();

  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), eq(notifications.orgId, user.orgId)))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return NextResponse.json(rows);
}

export async function PATCH() {
  const user = await requireUser();

  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

  return NextResponse.json({ ok: true });
}
