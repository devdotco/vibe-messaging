import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, sessions, channels, channelMembers } from '@/lib/db/schema/messaging';
import { eq, and, or } from 'drizzle-orm';
import crypto from 'crypto';
import { COOKIE_NAME, sessionCookieOptions } from '@/lib/auth/session';
import sgMail from '@sendgrid/mail';
import { withBase } from '@/lib/base-path';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function magicSecret() {
  return process.env.MAGIC_LINK_SECRET ?? process.env.EMAIL_REPLY_SECRET ?? 'dev-magic-secret';
}

export function buildMagicToken(email: string, next: string, expiryMs = 60 * 60 * 1000) {
  const exp = Date.now() + expiryMs;
  const payload = Buffer.from(JSON.stringify({ email, next, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', magicSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyMagicToken(token: string): { email: string; next: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', magicSecret()).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { email: string; next: string; exp: number };
    if (!data.exp || Date.now() > data.exp) return null;
    return { email: data.email, next: data.next };
  } catch {
    return null;
  }
}

// ── POST /api/auth/magic — send magic link ───────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as { email?: string; next?: string };
  const email = (body.email ?? '').toLowerCase().trim();
  const next = body.next ?? '/';

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  // Look up user by login email OR personal email
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, email), eq(users.personalEmail, email)))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'No account found for that email address.' }, { status: 404 });
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
  }

  const token = buildMagicToken(email, next);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'app.erp.io';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const verifyUrl = `${proto}://${host}/api/auth/magic/verify?token=${encodeURIComponent(token)}`;

  sgMail.setApiKey(apiKey);
  const fromRaw = process.env.EMAIL_FROM ?? 'erp.io Messaging <notifications@vb.co>';
  const fromMatch = fromRaw.match(/^(.+?)\s*<([^>]+)>$/);
  const from = fromMatch
    ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
    : { email: fromRaw.trim() };

  try {
    await sgMail.send({
      from,
      to: email,
      subject: 'Your erp.io Messaging sign-in link',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#2563eb,#6d4be0);display:inline-flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:18px;margin-bottom:16px">V</div>
          <h1 style="font-size:20px;margin:0 0 8px">Sign in to erp.io Messaging</h1>
          <p style="color:#6b7280;margin:0 0 24px">Click the button below to sign in. This link expires in 1 hour.</p>
          <a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Sign in to erp.io Messaging</a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore it.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[magic-link] SendGrid error', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
