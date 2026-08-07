import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channels, channelMembers } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const allChannels = await db
    .select({
      id: channels.id,
      name: channels.name,
      description: channels.description,
      type: channels.type,
      isArchived: channels.isArchived,
      isDefault: channels.isDefault,
      claudeEnabled: channels.claudeEnabled,
      orgId: channels.orgId,
      createdAt: channels.createdAt,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM channel_members
        WHERE channel_members.channel_id = ${channels.id}
      )`.mapWith(Number),
    })
    .from(channels)
    .orderBy(desc(channels.createdAt));

  return NextResponse.json(allChannels);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, type, claudeEnabled, isDefault } = body as {
    name: string;
    description?: string;
    type?: string;
    claudeEnabled?: boolean;
    isDefault?: boolean;
  };

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const [channel] = await db
    .insert(channels)
    .values({
      orgId: user.orgId,
      name,
      description: description ?? null,
      type: type ?? 'public',
      claudeEnabled: claudeEnabled ?? true,
      isDefault: isDefault ?? false,
      createdBy: user.id,
    })
    .returning();

  // Add creator as admin member
  await db.insert(channelMembers).values({
    channelId: channel.id,
    userId: user.id,
    orgId: user.orgId,
    role: 'admin',
  });

  return NextResponse.json({ ...channel, memberCount: 1 }, { status: 201 });
}
