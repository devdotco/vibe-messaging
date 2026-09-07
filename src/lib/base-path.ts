/**
 * Where this app is mounted.
 *
 * Chat is served from `app.erp.io/chat` rather than its own subdomain so the
 * suite shares ONE origin: one session cookie and no cross-site hand-off.
 *
 * Next's `basePath` rewrites `<Link>`, the router, `redirect()` and static
 * assets. It does NOT touch strings — an app-absolute path built as text
 * resolves against the ORIGIN and lands on the shell.
 *
 * Kept in lockstep with `basePath` in next.config.ts by hand; Next exposes no
 * public runtime accessor for it.
 */
export const BASE_PATH = '/chat';

/** Prefix an app-absolute path with the mount. Idempotent. */
export function withBase(path: string): string {
  if (!path.startsWith('/')) return `${BASE_PATH}/${path}`;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}

/** Strip the mount, for matching against unprefixed route lists. */
export function stripBase(path: string): string {
  if (path === BASE_PATH) return '/';
  return path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path;
}

/** `fetch` for this app's own API. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(withBase(path), init);
}
