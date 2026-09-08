import { NextRequest, NextResponse } from 'next/server';
import { and, arrayContains, desc, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, channels, channelMembers, dmConversations } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * The cross-module link contract, implemented for Chat.
 * See packages/erp-ui/module-links.ts for the shape.
 *
 * What Chat knows about a person is where you talk to them: the DM thread you
 * share, and the channels you are both in. Channels the person belongs to but
 * the caller does not are deliberately left out — a contact tab is not a way
 * to enumerate private rooms you were never invited to.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ records: [] });

  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  const rawQ = req.nextUrl.searchParams.get('q');
  const q = rawQ?.trim();
  // A `q` that is present but blank asks for the MOST RECENT channels — what
  // the CRM's attach picker opens with, so it is useful before anyone types.
  const wantsRecent = rawQ !== null && !q;
  if (!email && !q && !wantsRecent) return NextResponse.json({ records: [] });

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.erp.io/chat').replace(/\/$/, '');
  const records: {
    id: string;
    title: string;
    subtitle?: string;
    url: string;
    status?: string;
    at?: string;
  }[] = [];

  if (email) {
    const [person] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, me.orgId), eq(users.email, email)))
      .limit(1);
    if (!person) return NextResponse.json({ records: [] });

    // The DM thread, if one exists. participantIds is an array column, so both
    // sides have to be contained in it.
    if (person.id !== me.id) {
      const dms = await db
        .select({ id: dmConversations.id, createdAt: dmConversations.createdAt })
        .from(dmConversations)
        .where(
          and(
            eq(dmConversations.orgId, me.orgId),
            arrayContains(dmConversations.participantIds, [me.id, person.id]),
          ),
        )
        .limit(5);
      for (const d of dms) {
        records.push({
          id: d.id,
          title: `Direct messages with ${person.name}`,
          url: `${base}/dms/${d.id}`,
          status: 'Direct message',
          at: d.createdAt?.toISOString(),
        });
      }
    }

    // Channels both of us are in.
    const mine = await db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(and(eq(channelMembers.orgId, me.orgId), eq(channelMembers.userId, me.id)))
      .limit(500);
    const mineIds = new Set(mine.map((m) => m.channelId));

    if (mineIds.size > 0) {
      const theirs = await db
        .select({ channelId: channelMembers.channelId, joinedAt: channelMembers.joinedAt })
        .from(channelMembers)
        .where(
          and(
            eq(channelMembers.orgId, me.orgId),
            eq(channelMembers.userId, person.id),
            inArray(channelMembers.channelId, [...mineIds]),
          ),
        )
        .limit(50);

      if (theirs.length > 0) {
        const rows = await db
          .select({ id: channels.id, name: channels.name, type: channels.type, isArchived: channels.isArchived })
          .from(channels)
          .where(
            and(
              eq(channels.orgId, me.orgId),
              inArray(channels.id, theirs.map((t) => t.channelId)),
            ),
          )
          .limit(50);
        const joinedAt = new Map(theirs.map((t) => [t.channelId, t.joinedAt]));
        for (const c of rows) {
          records.push({
            id: c.id,
            title: `#${c.name}`,
            subtitle: 'Shared channel',
            url: `${base}/channels/${c.id}`,
            status: c.isArchived ? 'Archived' : c.type === 'private' ? 'Private' : 'Public',
            at: joinedAt.get(c.id)?.toISOString(),
          });
        }
      }
    }
  } else {
    // Manual attach: search the channels the caller can actually see.
    const mine = await db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(and(eq(channelMembers.orgId, me.orgId), eq(channelMembers.userId, me.id)))
      .limit(500);
    const mineIds = mine.map((m) => m.channelId);
    if (mineIds.length === 0) return NextResponse.json({ records: [] });

    const rows = await db
      .select({ id: channels.id, name: channels.name, type: channels.type, createdAt: channels.createdAt })
      .from(channels)
      .where(
        wantsRecent
          ? and(eq(channels.orgId, me.orgId), inArray(channels.id, mineIds))
          : and(eq(channels.orgId, me.orgId), inArray(channels.id, mineIds), ilike(channels.name, `%${q}%`)),
      )
      .orderBy(desc(channels.createdAt))
      .limit(25);
    for (const c of rows) {
      records.push({
        id: c.id,
        title: `#${c.name}`,
        subtitle: 'Channel',
        url: `${base}/channels/${c.id}`,
        status: c.type === 'private' ? 'Private' : 'Public',
        at: c.createdAt?.toISOString(),
      });
    }
  }

  return NextResponse.json({ records }, { headers: { 'Cache-Control': 'no-store' } });
}
