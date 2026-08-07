import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages, messageAttachments, users, channelMembers } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, desc } from 'drizzle-orm';

export interface FileEntry {
  messageId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date | null;
  attachments: {
    id: string;
    url: string;
    filename: string;
    fileType: string;
    size: number | null;
  }[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await requireUser();
  const { channelId } = await params;

  // Verify membership
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // Fetch messages with attachments (via join)
  const rows = await db
    .select({
      messageId: messages.id,
      userId: messages.userId,
      content: messages.content,
      createdAt: messages.createdAt,
      attachmentId: messageAttachments.id,
      url: messageAttachments.url,
      filename: messageAttachments.filename,
      fileType: messageAttachments.fileType,
      fileSize: messageAttachments.fileSize,
      userName: users.name,
    })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .innerJoin(users, eq(messages.userId, users.id))
    .where(
      and(
        eq(messages.channelId, channelId),
        eq(messages.orgId, user.orgId),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(50);

  // Group attachments by message
  const map = new Map<string, FileEntry>();
  for (const row of rows) {
    if (!map.has(row.messageId)) {
      map.set(row.messageId, {
        messageId: row.messageId,
        userId: row.userId,
        userName: row.userName,
        content: row.content,
        createdAt: row.createdAt,
        attachments: [],
      });
    }
    map.get(row.messageId)!.attachments.push({
      id: row.attachmentId,
      url: row.url,
      filename: row.filename,
      fileType: row.fileType,
      size: row.fileSize,
    });
  }

  return NextResponse.json(Array.from(map.values()));
}
