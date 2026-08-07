import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, userPresence } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();

  const orgUsers = await db
    .select({ user: users, presence: userPresence })
    .from(users)
    .leftJoin(userPresence, eq(userPresence.userId, users.id))
    .where(and(eq(users.orgId, user.orgId), eq(users.status, 'active')));

  return NextResponse.json(orgUsers);
}
