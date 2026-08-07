import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher/server';
import { requireUser } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.text();
  const params = new URLSearchParams(body);

  const socketId = params.get('socket_id')!;
  const channelName = params.get('channel_name')!;

  // Only allow users to auth for their own org channels
  if (!channelName.startsWith(`org-${user.orgId}-`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const auth = pusherServer.authorizeChannel(socketId, channelName);
  return NextResponse.json(auth);
}
