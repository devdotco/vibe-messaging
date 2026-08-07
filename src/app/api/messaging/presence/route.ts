import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userPresence } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json();
  const { status, statusMessage } = body as {
    status: 'online' | 'away' | 'offline';
    statusMessage?: string;
  };

  if (!['online', 'away', 'offline'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const now = new Date();

  await db
    .insert(userPresence)
    .values({
      userId: user.id,
      orgId: user.orgId,
      status,
      statusMessage: statusMessage ?? null,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPresence.userId,
      set: {
        status,
        statusMessage: statusMessage ?? null,
        lastSeenAt: now,
        updatedAt: now,
      },
    });

  return NextResponse.json({ ok: true });
}
