import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { dmConversations } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();

  const convos = await db
    .select()
    .from(dmConversations)
    .where(
      and(
        eq(dmConversations.orgId, user.orgId),
        sql`${user.id} = ANY(${dmConversations.participantIds})`,
      ),
    );

  return NextResponse.json(convos);
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { participantIds }: { participantIds: string[] } = await req.json();

  const allIds = [...new Set([user.id, ...participantIds])].sort();

  const existing = await db
    .select()
    .from(dmConversations)
    .where(
      and(
        eq(dmConversations.orgId, user.orgId),
        sql`${dmConversations.participantIds} = ${allIds}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) return NextResponse.json(existing[0]);

  const [convo] = await db
    .insert(dmConversations)
    .values({ orgId: user.orgId, participantIds: allIds })
    .returning();

  return NextResponse.json(convo, { status: 201 });
}
