import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gt, gte, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelMembers, channels, dmConversations, dmMessages, messages, users } from '@/lib/db/schema/messaging';
import { AssertionError, brighamServiceKey, spendJti, verifyBrighamAssertion } from '@/lib/brigham/assertion';

/**
 * Brigham → Chat: what the acting person has missed, for insights in Brigham.
 *
 * Signed Brigham assertion (aud=chat, bound to THIS path, so the late-answer
 * webhook's assertions cannot be spent here). The person is `act` resolved to
 * their Chat account in the assertion's org; they see channels they are a
 * MEMBER of (never public channels they have not joined) and DMs they are a
 * participant in. The Brigham thread itself is not in these tables.
 */

const PATH = '/api/brigham/messages';
const APP = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.erp.io/chat').replace(/\/$/, '');
const SNIPPET = 400;

const Body = z.object({
  view: z.enum(['unread', 'mentions', 'recent', 'search']).default('unread'),
  /** search: words to look for. */
  query: z.string().max(200).default(''),
  /** Part of a channel name; '' = all. */
  channel: z.string().max(100).default(''),
  days: z.number().int().min(1).max(30).default(3),
  limit: z.number().int().min(1).max(100).default(30),
});

const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
const snip = (s: string) => (s.length > SNIPPET ? `${s.slice(0, SNIPPET)}…` : s);

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('ErpService ') ? auth.slice('ErpService '.length).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let v;
  try {
    v = await verifyBrighamAssertion(token, { method: 'POST', path: PATH, body: raw }, await brighamServiceKey());
  } catch (err) {
    if (!(err instanceof AssertionError)) console.error('[brigham messages] verify failed:', (err as Error).message);
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!spendJti(v.jti, v.expiresAt)) return NextResponse.json({ error: 'replayed' }, { status: 401 });

  let q;
  try { q = Body.parse(JSON.parse(raw || '{}')); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const [me] = await db.select({ id: users.id, orgId: users.orgId, name: users.name }).from(users)
    .where(and(eq(users.orgId, v.shellOrgId), sql`lower(${users.email}) = ${v.actor.email}`, eq(users.status, 'active'))).limit(1);
  if (!me) return NextResponse.json({ error: 'no_account', message: 'This person has no Chat account in this organization.' }, { status: 404 });

  // Channels I belong to (org-checked on both sides), optionally narrowed by name.
  const mine = await db.select({ id: channels.id, name: channels.name, lastReadAt: channelMembers.lastReadAt })
    .from(channelMembers)
    .innerJoin(channels, and(eq(channelMembers.channelId, channels.id), eq(channels.orgId, me.orgId)))
    .where(and(
      eq(channelMembers.userId, me.id), eq(channelMembers.orgId, me.orgId),
      or(isNull(channels.isArchived), eq(channels.isArchived, false)),
      q.channel ? sql`${channels.name} ilike ${like(q.channel)}` : undefined,
    ));
  const channelIds = mine.map((c) => c.id);
  const channelName = new Map(mine.map((c) => [c.id, c.name]));

  const myDms = q.channel ? [] : await db.select({ id: dmConversations.id, participantIds: dmConversations.participantIds })
    .from(dmConversations)
    .where(and(eq(dmConversations.orgId, me.orgId), sql`${me.id} = ANY(${dmConversations.participantIds})`));
  const dmIds = myDms.map((d) => d.id);

  // Unread per channel: top-level messages after my last read (all of them if never read).
  const unreadByChannel = (await Promise.all(mine.map(async (c) => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(
      eq(messages.channelId, c.id), eq(messages.orgId, me.orgId), isNull(messages.parentMessageId), isNull(messages.deletedAt),
      ne(messages.userId, me.id), c.lastReadAt ? gt(messages.createdAt, c.lastReadAt) : undefined,
    ));
    return { channel: c.name, unread: r?.n ?? 0 };
  }))).filter((c) => c.unread > 0).sort((a, b) => b.unread - a.unread);

  const since = new Date(Date.now() - q.days * 86_400_000);
  const mentionsMe = sql`${me.id} = ANY(${messages.mentions})`;

  // Channel messages for the chosen view.
  const lastRead = new Map(mine.map((c) => [c.id, c.lastReadAt]));
  const chanWhere = channelIds.length === 0 ? undefined : and(
    inArray(messages.channelId, channelIds), eq(messages.orgId, me.orgId), isNull(messages.deletedAt),
    q.view === 'unread' ? and(ne(messages.userId, me.id), gte(messages.createdAt, since)) : undefined,
    q.view === 'mentions' ? and(mentionsMe, gte(messages.createdAt, since)) : undefined,
    q.view === 'recent' ? gte(messages.createdAt, since) : undefined,
    q.view === 'search' && q.query ? ilike(messages.content, like(q.query)) : undefined,
  );
  const chanRows = chanWhere
    ? await db.select({ id: messages.id, channelId: messages.channelId, userId: messages.userId, content: messages.content, createdAt: messages.createdAt })
      .from(messages).where(chanWhere).orderBy(desc(messages.createdAt)).limit(q.limit * 2)
    : [];
  const chanItems = chanRows
    // unread = after my last read in that channel
    .filter((m) => q.view !== 'unread' || !lastRead.get(m.channelId) || (m.createdAt && m.createdAt > lastRead.get(m.channelId)!))
    .map((m) => ({ where: `#${channelName.get(m.channelId) ?? 'channel'}`, userId: m.userId, text: m.content, at: m.createdAt, url: `${APP}/channels/${m.channelId}` }));

  // DMs (no per-person read marker exists for DMs, so "unread" = from others, recently).
  const dmWhere = dmIds.length === 0 || q.view === 'mentions' ? undefined : and(
    inArray(dmMessages.conversationId, dmIds), eq(dmMessages.orgId, me.orgId), isNull(dmMessages.deletedAt),
    q.view === 'search' ? (q.query ? ilike(dmMessages.content, like(q.query)) : undefined) : gte(dmMessages.createdAt, since),
    q.view === 'unread' ? ne(dmMessages.userId, me.id) : undefined,
  );
  const dmRows = dmWhere
    ? await db.select({ conversationId: dmMessages.conversationId, userId: dmMessages.userId, content: dmMessages.content, createdAt: dmMessages.createdAt })
      .from(dmMessages).where(dmWhere).orderBy(desc(dmMessages.createdAt)).limit(q.limit)
    : [];

  // Names: authors, and the other side of each DM.
  const people = new Set<string>([...chanItems.map((m) => m.userId), ...dmRows.map((m) => m.userId), ...myDms.flatMap((d) => d.participantIds ?? [])]);
  const names = people.size
    ? new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...people]))).map((u) => [u.id, u.name]))
    : new Map<string, string>();
  const dmLabel = new Map(myDms.map((d) => [d.id, `DM with ${(d.participantIds ?? []).filter((p) => p !== me.id).map((p) => names.get(p) ?? 'someone').join(', ') || 'yourself'}`]));

  const items = [
    ...chanItems,
    ...dmRows.map((m) => ({ where: dmLabel.get(m.conversationId) ?? 'DM', userId: m.userId, text: m.content, at: m.createdAt, url: `${APP}/dms/${m.conversationId}` })),
  ]
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
    .slice(0, q.limit)
    .map((m) => ({ where: m.where, author: m.userId === me.id ? 'you' : (names.get(m.userId) ?? 'someone'), at: m.at, text: snip(m.text), url: m.url }));

  const [mentionCount] = channelIds.length
    ? await db.select({ n: sql<number>`count(*)::int` }).from(messages)
      .where(and(inArray(messages.channelId, channelIds), isNull(messages.deletedAt), mentionsMe, gte(messages.createdAt, since)))
    : [{ n: 0 }];

  return NextResponse.json({
    person: me.name, view: q.view, days: q.days,
    summary: {
      channels: mine.length, dmConversations: myDms.length,
      unreadTotal: unreadByChannel.reduce((s, c) => s + c.unread, 0),
      mentionsInPeriod: mentionCount?.n ?? 0,
    },
    unreadByChannel: unreadByChannel.slice(0, 25),
    messages: items,
    truncated: items.length === q.limit,
  });
}
