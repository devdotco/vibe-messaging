import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { airbyteConnections } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { triggerSync } from '@/lib/airbyte/client';
import { eq, and } from 'drizzle-orm';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const user = await requireUser();
  const { connectionId } = await params;

  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [conn] = await db.select().from(airbyteConnections)
    .where(and(eq(airbyteConnections.id, connectionId), eq(airbyteConnections.orgId, user.orgId)));

  if (!conn) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const jobId = await triggerSync(conn.airbyteConnectionId);
  return NextResponse.json({ jobId });
}
