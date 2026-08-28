import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { sessions, users } from '@/lib/db/schema/messaging';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Chat's OWN session cookie.
 *
 * Deliberately not `__vibe_session`, and deliberately host-scoped. This app
 * used to write its opaque session token under that name on domain `.vb.co` —
 * the same name and domain the shell uses for its iron-session blob — so the
 * two overwrote each other. Signing in here silently signed you out of
 * app.vb.co and every other module.
 *
 * We still READ `__vibe_session` below, because it is how a shell session is
 * recognised via finance's /api/auth/me. We just never write it any more.
 * Same fix, and the same reasoning, as `__sdr_session` and `__vibe_pm_session`.
 */
export const COOKIE_NAME = '__vibe_chat_session';

/** The suite-wide shell cookie. Read-only here — never written by this app. */
export const SHELL_COOKIE_NAME = '__vibe_session';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// finance.vb.co validates a shell session and exposes /api/auth/me. Kept as a
// fallback so nobody who reaches Chat that way today loses access; the shell
// hand-off at /api/auth/callback is the path new sessions take.
const AUTH_URL = process.env.AUTH_URL ?? 'https://finance.vb.co';

/**
 * Cookie options for the session this app issues. No `domain`: host-scoped to
 * chat.vb.co on purpose — a `.vb.co` cookie is what caused the collision.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  };
}

/** Issue a session for a user, returning the raw token to set as a cookie. */
export async function createSessionToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });
  return token;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  // This app's own session first; the shell cookie second, so the finance
  // validation path below still recognises people who arrive with one.
  const token = cookieStore.get(COOKIE_NAME)?.value ?? cookieStore.get(SHELL_COOKIE_NAME)?.value;
  if (!token) return null;

  // 1. Local sessions table — fast path, covers repeat visits.
  const [session] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  if (session?.user.status === 'active') return session.user;

  // 2. Cross-app SSO: validate against finance.vb.co (the canonical auth source).
  //    Session was created there; our local DB has no record until we upsert below.
  try {
    const res = await fetch(`${AUTH_URL}/api/auth/me`, {
      headers: { cookie: `${COOKIE_NAME}=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json() as { id: string; email: string; name: string; orgId: string; status: string };
    if (!data?.id || data.status !== 'active') return null;

    // Upsert user so future requests hit local DB.
    const existing = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
    let localUser = existing[0];
    if (!localUser) {
      [localUser] = await db
        .insert(users)
        .values({ id: data.id, orgId: data.orgId, email: data.email, name: data.name, status: 'active' })
        .onConflictDoNothing()
        .returning();
    }
    if (!localUser) {
      [localUser] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
    }
    if (!localUser) return null;

    // Cache session so next request is fast.
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db
      .insert(sessions)
      .values({ userId: localUser.id, tokenHash: hashToken(token), expiresAt })
      .onConflictDoNothing();

    return localUser;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthenticated');
  return user;
}
