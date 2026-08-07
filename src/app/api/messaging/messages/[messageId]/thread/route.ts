import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const user = await requireUser();
  const { messageId } = await params;

  const thread = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.parentMessageId, messageId),
        eq(messages.orgId, user.orgId),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(asc(messages.createdAt));

  return NextResponse.json(thread);
}
