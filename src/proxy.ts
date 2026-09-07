import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, SHELL_COOKIE_NAME } from '@/lib/auth/session';
import { stripBase, withBase } from '@/lib/base-path';

const PUBLIC = ['/sign-in', '/api/webhooks', '/api/webhooks/email/inbound', '/api/health', '/api/auth', '/api/messaging/webhooks'];

export function proxy(req: NextRequest) {
  /*
   * Matched WITHOUT the mount. `/chat/sign-in` does not start with `/sign-in`,
   * so every public path would have become private at once — including the
   * auth routes, which would have bounced the hand-off token into a sign-in
   * that itself required signing in.
   */
  const path = stripBase(req.nextUrl.pathname);
  const isPublic = PUBLIC.some(p => path.startsWith(p));
  if (isPublic) return NextResponse.next();
  // Either this app's own session or a shell cookie the finance path can
  // still validate. Signed-out visitors go to the LOCAL sign-in, never
  // straight to app.vb.co: plenty of people here were invited to a channel by
  // email and have no shell account to be handed off from.
  const token =
    req.cookies.get(COOKIE_NAME)?.value ?? req.cookies.get(SHELL_COOKIE_NAME)?.value;
  if (!token) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'chat.vb.co';
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    // withBase: Next hands us the path with the mount stripped, so without it
    // this returns people to the SHELL's page after signing in.
    const publicUrl = `${proto}://${host}${withBase(path)}${req.nextUrl.search}`;
    return NextResponse.redirect(
      new URL(withBase(`/sign-in?next=${encodeURIComponent(publicUrl)}`), `${proto}://${host}`)
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
