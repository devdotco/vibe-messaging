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
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'app.erp.io';
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    // withBase: Next hands us the path with the mount stripped, so without it
    // this returns people to the SHELL's page after signing in.
    const publicUrl = `${proto}://${host}${withBase(path)}${req.nextUrl.search}`;
  /*
   * FAST PATH. Signed in to the suite but not yet to this module: go straight
   * through the hand-off rather than showing a local sign-in.
   *
   * Only possible since the modules were collapsed onto one origin — the
   * shell's cookie is scoped to app.erp.io, so it now arrives with this
   * request. On the old subdomain it never did, which is why every module
   * switch had to start from the shell and cost three round trips.
   *
   * The local sign-in still stands for anyone with no shell session at all —
   * people invited straight to a board or a document, who have no erp.io
   * account to be handed off from.
   *
   * `next` is the UNMOUNTED path: the module's callback adds the mount back
   * with withBase, and sign-erp's withBase is deliberately not idempotent.
   */
  if (req.cookies.get("__vibe_session")?.value) {
    const shell = (process.env.SHELL_URL ?? "https://app.erp.io").replace(/\/$/, "");
    const handoff = new URL(`${shell}/api/shell/auth/module-token`);
    handoff.searchParams.set("aud", "messaging");
    handoff.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(handoff);
  }

    return NextResponse.redirect(
      new URL(withBase(`/sign-in?next=${encodeURIComponent(publicUrl)}`), `${proto}://${host}`)
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
