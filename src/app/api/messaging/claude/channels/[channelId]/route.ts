import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channels } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;
  const { enabled } = await req.json();

  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [updated] = await db
    .update(channels)
    .set({ claudeEnabled: enabled, updatedAt: new Date() })
    .where(and(eq(channels.id, channelId), eq(channels.orgId, user.orgId)))
    .returning();

  return NextResponse.json(updated);
}
