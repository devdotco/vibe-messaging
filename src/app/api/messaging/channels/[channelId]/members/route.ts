import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelMembers, users } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  const members = await db
    .select({ member: channelMembers, user: users })
    .from(channelMembers)
    .innerJoin(users, eq(channelMembers.userId, users.id))
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.orgId, user.orgId)));

  return NextResponse.json(members);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;
  const { userId } = await req.json();

  const [member] = await db
    .insert(channelMembers)
    .values({ channelId, userId, orgId: user.orgId, role: 'member' })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json(member, { status: 201 });
}
