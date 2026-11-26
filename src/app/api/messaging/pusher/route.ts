import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher/server';
import { parseChannel } from '@/lib/pusher/channels';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channelMembers, dmConversations } from '@/lib/db/schema/messaging';
import { and, eq, sql } from 'drizzle-orm';

/*
 * Authorizes `private-` channel subscriptions. Mirrors the read checks of the
 * matching REST routes: a channel needs membership (as GET .../messages does),
 * a DM needs participation, a user channel must be the caller's own, and
 * org-wide channels need the same org. Anything unrecognised is denied.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const params = new URLSearchParams(await req.text());
  const socketId = params.get('socket_id');
  const channelName = params.get('channel_name');
  if (!socketId || !channelName) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const parsed = parseChannel(channelName, user.orgId);
  let allowed = false;
  switch (parsed.kind) {
    case 'org':
    case 'presence':
      allowed = true;
      break;
    case 'user':
      allowed = parsed.userId === user.id;
      break;
    case 'channel': {
      const [m] = await db.select({ id: channelMembers.channelId }).from(channelMembers)
        .where(and(eq(channelMembers.channelId, parsed.channelId), eq(channelMembers.userId, user.id)));
      allowed = !!m;
      break;
    }
    case 'dm': {
      const [c] = await db.select({ id: dmConversations.id }).from(dmConversations)
        .where(and(eq(dmConversations.id, parsed.conversationId), eq(dmConversations.orgId, user.orgId),
          sql`${user.id} = ANY(${dmConversations.participantIds})`));
      allowed = !!c;
      break;
    }
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(pusherServer.authorizeChannel(socketId, channelName));
}
