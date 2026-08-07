import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { pusherServer } from '@/lib/pusher/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { channelId } = await params;
  const body = await req.json();
  const { typing } = body as { typing: boolean };

  await pusherServer.trigger(
    `org-${user.orgId}-channel-${channelId}`,
    'typing.update',
    { userId: user.id, name: user.name, typing },
  );

  return NextResponse.json({ ok: true });
}
