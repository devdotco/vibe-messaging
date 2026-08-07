import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userPresence, users } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';
import { eq } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json();

  if (body.presence) {
    await db.insert(userPresence)
      .values({ userId: user.id, orgId: user.orgId, status: body.presence, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPresence.userId,
        set: { status: body.presence, updatedAt: new Date() },
      });

    await pusherServer.trigger(`org-${user.orgId}-presence`, 'user.presence', {
      userId: user.id,
      status: body.presence,
    });
  }

  return NextResponse.json({ ok: true });
}
