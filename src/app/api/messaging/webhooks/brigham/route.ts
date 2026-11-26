import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/messaging';
import { AssertionError, brighamServiceKey, spendJti, verifyBrighamAssertion } from '@/lib/brigham/assertion';
import { addToThread } from '@/lib/brigham/server';
import { z } from '@/lib/validate';

/**
 * Brigham → a person's private Brigham thread. Public in the proxy
 * (/api/messaging/webhooks); the signed assertion is the authentication and
 * it fails closed (no key configured = 401 for everything).
 *
 * The recipient is the person in the assertion's `act`, never the body. The
 * body's chatUserId only picks WHICH of that person's Chat accounts (they can
 * have one per org) and is refused unless its email is theirs.
 */

const PATH = '/api/messaging/webhooks/brigham';

const Post = z.object({
  text: z.string().trim().min(1).max(40_000),
  kind: z.enum(['answer', 'update']),
  chatUserId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  url: z.string().url().max(500).optional(),
  status: z.enum(['done', 'working', 'failed']).optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('ErpService ') ? auth.slice('ErpService '.length).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let verified;
  try {
    verified = await verifyBrighamAssertion(token, { method: 'POST', path: PATH, body: raw }, await brighamServiceKey());
  } catch (err) {
    if (!(err instanceof AssertionError)) console.error('[brigham webhook] verify failed:', (err as Error).message);
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!spendJti(verified.jti, verified.expiresAt)) return NextResponse.json({ error: 'replayed' }, { status: 401 });

  let body;
  try { body = Post.parse(JSON.parse(raw)); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const email = verified.actor.email;
  const [recipient] = body.chatUserId
    ? await db.select().from(users).where(and(eq(users.id, body.chatUserId), sql`lower(${users.email}) = ${email}`)).limit(1)
    : await db.select().from(users).where(and(eq(users.orgId, verified.shellOrgId), sql`lower(${users.email}) = ${email}`)).limit(1);
  if (!recipient || recipient.status !== 'active') return NextResponse.json({ error: 'no such person in Chat' }, { status: 404 });
  // The url is shown as a link; only Brigham's own pages.
  const url = body.url && new URL(body.url).origin === 'https://app.erp.io' ? body.url : null;

  await addToThread({
    orgId: recipient.orgId, userId: recipient.id,
    role: body.kind === 'answer' ? 'brigham' : 'update',
    content: body.text, status: body.status ?? null, url,
    brighamConversationId: body.conversationId ?? null,
  });
  return NextResponse.json({ ok: true });
}
