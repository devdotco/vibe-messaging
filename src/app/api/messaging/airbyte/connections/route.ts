import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { airbyteConnections } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  const conns = await db.select().from(airbyteConnections).where(eq(airbyteConnections.orgId, user.orgId));
  return NextResponse.json(conns);
}
