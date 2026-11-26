import { NextRequest, NextResponse, after } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brighamMessages } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { validate, z } from '@/lib/validate';
import { addToThread, askBrigham, brighamToken, currentConversation } from '@/lib/brigham/server';

/**
 * The person's private Brigham thread. Every query is scoped to the CALLER
 * (org + user): there is no way to name someone else's thread.
 */

export const maxDuration = 120;

const Ask = z.object({ content: z.string().trim().min(1).max(2000) });

export async function GET() {
  const user = await requireUser();
  const rows = await db.select().from(brighamMessages)
    .where(and(eq(brighamMessages.orgId, user.orgId), eq(brighamMessages.userId, user.id)))
    .orderBy(asc(brighamMessages.createdAt))
    .limit(500);
  return NextResponse.json(rows.slice(-200));
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!rateLimit(`brigham:${user.id}`, 20, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many questions. Give Brigham a minute.' }, { status: 429 });
  }
  const parsed = validate(Ask, await req.json().catch(() => ({})));
  if (!parsed.success) return parsed.response;
  const question = parsed.data.content;

  // Read now: request APIs are not for use after the response.
  const cookie = req.headers.get('cookie') ?? '';
  const conversationId = await currentConversation(user.orgId, user.id);

  const message = await addToThread({ orgId: user.orgId, userId: user.id, role: 'user', content: question, brighamConversationId: conversationId });

  after(async () => {
    const token = await brighamToken(cookie);
    if (!token) {
      await addToThread({
        orgId: user.orgId, userId: user.id, role: 'brigham', status: 'failed',
        content: "Brigham isn't switched on for the organization you're signed in to on erp.io, or your erp.io session has expired. Switch org in erp.io, or sign in again, then retry.",
      });
      return;
    }
    const a = await askBrigham(token, { question, conversationId, chatUserId: user.id });
    await addToThread({
      orgId: user.orgId, userId: user.id, role: 'brigham', content: a.answer,
      status: a.status, url: a.url, brighamConversationId: a.conversationId,
    });
  });

  return NextResponse.json(message, { status: 201 });
}
