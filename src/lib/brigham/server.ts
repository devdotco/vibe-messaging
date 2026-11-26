import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brighamMessages } from '@/lib/db/schema/messaging';
import { pusherServer } from '@/lib/pusher/server';
import { userChannel } from '@/lib/pusher/channels';
import { BRIGHAM_EVENT } from './thread';

/**
 * Chat → Brigham, AS THE PERSON ASKING.
 *
 * Chat holds no credential for Brigham. It forwards the asker's own shell
 * cookie (scoped to app.erp.io `/`, so it arrives with every Chat request) to
 * the shell's hand-off endpoint and gets a short-lived `aud=brigham` token —
 * exactly what the Brigham box in every module does. Entitlement, role capping
 * and org choice are the shell's, not re-implemented here; no token means the
 * person's org does not have Brigham.
 */

const shellUrl = () => (process.env.SHELL_URL ?? 'https://app.erp.io').replace(/\/$/, '');
const brighamUrl = () => (process.env.BRIGHAM_URL ?? 'https://app.erp.io/brigham').replace(/\/$/, '');

/** A follow-up within this window continues Brigham's conversation; later, a fresh one. */
const CONTINUE_WINDOW_MS = 12 * 60 * 60 * 1000;

export async function brighamToken(cookie: string): Promise<string | null> {
  if (!cookie) return null;
  try {
    const res = await fetch(`${shellUrl()}/api/shell/auth/module-token?aud=brigham`, {
      headers: { cookie, accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: unknown };
    return typeof body.token === 'string' ? body.token : null;
  } catch {
    return null;
  }
}

export type BrighamAnswer = { status: 'done' | 'working' | 'failed'; answer: string; conversationId: string | null; url: string | null };

export async function askBrigham(token: string, p: { question: string; conversationId: string | null; chatUserId: string }): Promise<BrighamAnswer> {
  try {
    const res = await fetch(`${brighamUrl()}/api/dock/ask`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ question: p.question, module: 'messaging', conversationId: p.conversationId, surface: 'chat', chatUserId: p.chatUserId }),
      // Brigham answers within ~75s and keeps longer runs going; under Cloudflare's 100s cap.
      signal: AbortSignal.timeout(90_000),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as
      | { status?: string; answer?: string; conversationId?: string; url?: string; error?: { message?: string } }
      | null;
    if (!res.ok || !data?.answer) {
      return { status: 'failed', answer: data?.error?.message ?? 'Brigham could not answer that just now.', conversationId: p.conversationId, url: null };
    }
    const status = data.status === 'done' || data.status === 'working' ? data.status : 'failed';
    return { status, answer: data.answer, conversationId: data.conversationId ?? p.conversationId, url: data.url ?? null };
  } catch {
    return { status: 'failed', answer: 'Brigham did not answer in time. Try again in a moment.', conversationId: p.conversationId, url: null };
  }
}

/** Brigham's conversation to continue, if the person spoke to it recently. */
export async function currentConversation(orgId: string, userId: string): Promise<string | null> {
  const [row] = await db.select({ id: brighamMessages.brighamConversationId }).from(brighamMessages)
    .where(and(
      eq(brighamMessages.orgId, orgId), eq(brighamMessages.userId, userId),
      isNotNull(brighamMessages.brighamConversationId),
      gt(brighamMessages.createdAt, new Date(Date.now() - CONTINUE_WINDOW_MS)),
    ))
    .orderBy(desc(brighamMessages.createdAt)).limit(1);
  return row?.id ?? null;
}

export async function addToThread(row: typeof brighamMessages.$inferInsert) {
  const [message] = await db.insert(brighamMessages).values(row).returning();
  // Pusher caps an event at 10KB; a long answer is announced and the page refetches.
  const payload = JSON.stringify({ message }).length < 9_000 ? { message } : { refetch: true };
  await pusherServer.trigger(userChannel(row.orgId, row.userId), BRIGHAM_EVENT, payload)
    .catch((err: Error) => console.error('[brigham] broadcast failed:', err.message));
  return message;
}
