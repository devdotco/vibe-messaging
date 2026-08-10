import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/sign-in', '/api/webhooks', '/api/webhooks/email/inbound', '/api/health', '/api/auth/magic', '/api/messaging/webhooks'];

export function proxy(req: NextRequest) {
  const isPublic = PUBLIC.some(p => req.nextUrl.pathname.startsWith(p));
  if (isPublic) return NextResponse.next();
  const token = req.cookies.get('__vibe_session')?.value;
  if (!token) {
    const signInUrl = process.env.AUTH_URL ?? 'https://finance.vb.co';
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'chat.vb.co';
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const publicUrl = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(publicUrl)}`, signInUrl)
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
