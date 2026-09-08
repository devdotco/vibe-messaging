import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, SHELL_COOKIE_NAME } from '@/lib/auth/session';
import { stripBase, withBase } from '@/lib/base-path';

// '/api/module-links' is the cross-module link endpoint: a DATA call, never a
// navigation, so it must never be answered with a redirect. Left private, the
// proxy sent the CRM's server-to-server fetch off to the SSO hand-off, `fetch`
// followed it, and the caller got a sign-in page with a 200 on it — which
// surfaced as "no results". It authenticates with this app's own session and
// returns an empty list when there is none, so it is fail-closed on its own.
const PUBLIC = ['/sign-in', '/api/webhooks', '/api/webhooks/email/inbound', '/api/health', '/api/auth', '/api/messaging/webhooks', '/api/module-links'];

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
  /*
   * The module's OWN session decides. The shell cookie used to be accepted here
   * as if it were one, which let the request through the proxy while the page
   * itself could not validate it — so Chat bounced to its sign-in anyway, and
   * did it after the navigation rather than before.
   */
  const own = req.cookies.get(COOKIE_NAME)?.value;
  if (!own) {
    /*
     * FAST PATH. Signed in to the suite but not yet to Chat: go straight
     * through the hand-off rather than showing a local sign-in.
     *
     * Only possible since the modules were collapsed onto one origin — the
     * shell's cookie is scoped to app.erp.io, so it now arrives with this
     * request. On chat.erp.io it never did.
     *
     * `next` is the UNMOUNTED path; the callback adds the mount back.
     */
    if (req.cookies.get(SHELL_COOKIE_NAME)?.value) {
      const shell = (process.env.SHELL_URL ?? 'https://app.erp.io').replace(/\/$/, '');
      const handoff = new URL(`${shell}/api/shell/auth/module-token`);
      handoff.searchParams.set('aud', 'messaging');
      handoff.searchParams.set('next', `${req.nextUrl.pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(handoff);
    }

    /*
     * The local sign-in stands for anyone with no shell session: plenty of
     * people here were invited to a channel by email and have no erp.io
     * account to be handed off from.
     */
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'app.erp.io';
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
