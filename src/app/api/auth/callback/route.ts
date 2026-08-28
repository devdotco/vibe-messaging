import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/messaging';
import { eq } from 'drizzle-orm';
import { verifyModuleToken, shellSignInUrl, type ShellIdentity } from '@/lib/auth/module-token';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '@/lib/auth/session';

/**
 * Redeems a shell-issued module token for a Chat session.
 *
 * The token is a 120-second, single-audience Ed25519 credential signed by a key
 * only app.vb.co holds. We verify it, mirror the person into this app's own
 * `users` table, mint our OWN host-scoped session, and never look at the token
 * again.
 *
 * Additive on purpose: the magic-link sign-in is untouched and remains the way
 * in for people who have no app.vb.co account.
 */

/** Only ever redirect within this app — an open redirect here is a real one. */
function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/**
 * Behind the proxy the request's own origin is the container's bind address,
 * so redirects built from it send the browser to 0.0.0.0 and stop there.
 */
function publicOrigin(req: NextRequest): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'chat.vb.co';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

/**
 * Find this person in Chat, or create them. Adopt-by-email: someone added to a
 * channel by address before they ever signed in keeps that same account rather
 * than getting a duplicate.
 */
async function mirrorPrincipal(identity: ShellIdentity) {
  const [existing] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);

  if (existing) {
    if (identity.fullName && existing.name !== identity.fullName) {
      await db.update(users).set({ name: identity.fullName }).where(eq(users.id, existing.id));
    }
    return existing;
  }

  if (!identity.shellOrgId) {
    throw new Error('Module token carries no organisation; refusing to create a user');
  }

  const [created] = await db
    .insert(users)
    .values({
      orgId: identity.shellOrgId,
      email: identity.email,
      name: identity.fullName || identity.email,
      status: 'active',
    })
    .returning();

  return created;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const next = safeReturnPath(req.nextUrl.searchParams.get('next'));
  const origin = publicOrigin(req);

  if (!token) {
    return NextResponse.redirect(shellSignInUrl(new URL(next, origin).toString()));
  }

  let user;
  try {
    const identity = await verifyModuleToken(token);
    user = await mirrorPrincipal(identity);
  } catch (err) {
    // Anything suspect — expired, wrong audience, wrong key, no org — is "not
    // signed in". Never a soft failure that lets the request through.
    console.warn('[auth/callback] rejected module token:', (err as Error).message);
    return NextResponse.redirect(shellSignInUrl(new URL(next, origin).toString()));
  }

  if (!user || user.status !== 'active') {
    return NextResponse.redirect(shellSignInUrl(new URL(next, origin).toString()));
  }

  const sessionToken = await createSessionToken(user.id);
  const res = NextResponse.redirect(new URL(next, origin));
  res.cookies.set(COOKIE_NAME, sessionToken, sessionCookieOptions());
  return res;
}
