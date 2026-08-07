import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/sign-in', '/api/webhooks', '/api/health'];

export function proxy(req: NextRequest) {
  const isPublic = PUBLIC.some(p => req.nextUrl.pathname.startsWith(p));
  if (isPublic) return NextResponse.next();
  const token = req.cookies.get('__vibe_session')?.value;
  if (!token) {
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(req.nextUrl.pathname)}`, req.url)
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
