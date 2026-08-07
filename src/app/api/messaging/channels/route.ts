import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channels, channelMembers } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();

  const memberships = await db
    .select({ channel: channels })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(
      and(
        eq(channelMembers.userId, user.id),
        eq(channels.orgId, user.orgId),
        eq(channels.isArchived, false),
      ),
    );

  return NextResponse.json(memberships.map((m) => m.channel));
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json();

  const [channel] = await db
    .insert(channels)
    .values({
      orgId: user.orgId,
      name: body.name,
      description: body.description,
      type: body.type ?? 'public',
      claudeEnabled: body.claudeEnabled ?? true,
      createdBy: user.id,
    })
    .returning();

  await db.insert(channelMembers).values({
    channelId: channel.id,
    userId: user.id,
    orgId: user.orgId,
    role: 'admin',
  });

  return NextResponse.json(channel, { status: 201 });
}
