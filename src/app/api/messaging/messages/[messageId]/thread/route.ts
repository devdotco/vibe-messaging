import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages, messageAttachments } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';

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

  const ids = thread.map((m) => m.id);
  const attachmentRows = ids.length > 0
    ? await db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, ids))
    : [];

  const byMessage: Record<string, typeof attachmentRows> = {};
  for (const a of attachmentRows) {
    if (!byMessage[a.messageId]) byMessage[a.messageId] = [];
    byMessage[a.messageId].push(a);
  }

  return NextResponse.json(thread.map((m) => ({
    ...m,
    reactions: [],
    attachments: (byMessage[m.id] ?? []).map((a) => ({
      id: a.id, url: a.url, filename: a.filename, fileType: a.fileType, fileSize: a.fileSize,
    })),
  })));
}
