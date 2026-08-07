import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, sessions, channels, channelMembers } from '@/lib/db/schema/messaging';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function GET(req: NextRequest) {
  const bypass = process.env.BYPASS_SECRET;
  if (!bypass) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const secret = searchParams.get('secret');
  const email = searchParams.get('email') ?? 'nate@dev.co';

  if (secret !== bypass) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
  }

  // Find or create user
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    [user] = await db.insert(users).values({
      orgId: 'platform_default',
      email,
      name,
      role: 'PLATFORM_ADMIN',
      status: 'active',
      isPlatformUser: true,
    }).returning();
  }

  // Auto-join default channels (is_default=true, deduplicated by name)
  const defaultChannels = await db.select().from(channels)
    .where(and(eq(channels.orgId, 'platform_default'), eq(channels.isDefault, true)));
  if (defaultChannels.length > 0) {
    await db.insert(channelMembers).values(
      defaultChannels.map(ch => ({
        channelId: ch.id,
        userId: user.id,
        orgId: 'platform_default',
        role: 'member' as const,
      }))
    ).onConflictDoNothing();
  }

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'chat.vb.co';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const res = NextResponse.redirect(new URL('/', `${proto}://${host}`));
  res.cookies.set('__vibe_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return res;
}
