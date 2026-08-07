import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userPresence } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { eq } from 'drizzle-orm';

async function upsertPresence(userId: string, orgId: string, status: string, statusMessage: string | null) {
  const now = new Date();
  await db
    .insert(userPresence)
    .values({ userId, orgId, status, statusMessage, lastSeenAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userPresence.userId,
      set: { status, statusMessage, lastSeenAt: now, updatedAt: now },
    });

  // Broadcast presence change to org
  await pusherServer.trigger(`org-${orgId}`, 'user.presence', { userId, status, statusMessage });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json();
  const { status, statusMessage } = body as { status: 'online' | 'away' | 'offline'; statusMessage?: string };

  if (!['online', 'away', 'offline'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  await upsertPresence(user.id, user.orgId, status, statusMessage ?? null);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json();
  const { statusMessage } = body as { statusMessage: string };

  // Get current status to preserve it
  const [current] = await db.select().from(userPresence).where(eq(userPresence.userId, user.id));
  const status = current?.status ?? 'online';

  await upsertPresence(user.id, user.orgId, status, statusMessage ?? null);
  return NextResponse.json({ ok: true });
}
