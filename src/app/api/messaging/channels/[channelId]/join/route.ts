import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channels, channelMembers } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { channelId } = await params;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId));

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  if (channel.isArchived) return NextResponse.json({ error: 'Channel is archived' }, { status: 400 });

  await db
    .insert(channelMembers)
    .values({
      channelId,
      userId: user.id,
      orgId: user.orgId,
      role: 'member',
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
