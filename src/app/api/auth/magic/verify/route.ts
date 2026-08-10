import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, sessions, channels, channelMembers } from '@/lib/db/schema/messaging';
import { eq, or, and } from 'drizzle-orm';
import crypto from 'crypto';
import { verifyMagicToken } from '../route';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawToken = searchParams.get('token');

  if (!rawToken) {
    return NextResponse.redirect(new URL('/sign-in?error=missing', req.url));
  }

  const parsed = verifyMagicToken(rawToken);
  if (!parsed) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid', req.url));
  }

  const { email, next } = parsed;

  // Find user by login email OR personal email
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, email), eq(users.personalEmail, email)))
    .limit(1);

  if (!user) {
    return NextResponse.redirect(new URL('/sign-in?error=notfound', req.url));
  }

  // Auto-join default channels
  const defaultChannels = await db
    .select()
    .from(channels)
    .where(and(eq(channels.orgId, user.orgId), eq(channels.isDefault, true)));

  if (defaultChannels.length > 0) {
    await db.insert(channelMembers).values(
      defaultChannels.map(ch => ({
        channelId: ch.id,
        userId: user.id,
        orgId: user.orgId,
        role: 'member' as const,
      }))
    ).onConflictDoNothing();
  }

  // Create session
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt,
  });

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'chat.vb.co';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';

  // Redirect to intended destination (must be same host for safety)
  const redirectUrl = (() => {
    try {
      const u = new URL(next, `${proto}://${host}`);
      if (u.hostname === host) return u.toString();
    } catch { /* ignore */ }
    return `${proto}://${host}/`;
  })();

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set('__vibe_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
    domain: process.env.COOKIE_DOMAIN ?? '.vb.co',
  });

  return res;
}
