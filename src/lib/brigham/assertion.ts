import { createHash } from 'node:crypto';
import { importSPKI, jwtVerify, type KeyObject, type CryptoKey } from 'jose';

/**
 * Brigham (app.erp.io/brigham) → Chat service assertions.
 *
 * Ported from crm-erp-io src/lib/auth/brigham-assertion.ts, with `aud` = "chat".
 * Brigham signs with ITS OWN Ed25519 key; Chat holds only the public half
 * (BRIGHAM_SERVICE_PUBLIC_KEY), so Chat can check Brigham sent a request but
 * can never produce one. Unset key = nothing verifies (fails closed).
 *
 * Each assertion is bound to one request: aud, method (htm), path (htu), the
 * exact body (bdy), ≤120s lifetime, and a single-use jti. `sub` is the shell
 * organization and `act` the person Brigham is acting for; the route writes
 * only to that person's own thread.
 */

export const BRIGHAM_SERVICE_ISSUER = 'https://app.erp.io/brigham';
export const SERVICE_JWT_TYPE = 'erp-service+jwt';
export const SERVICE_AUDIENCE = 'chat';
export const SERVICE_MAX_TTL_SECONDS = 120;

export class AssertionError extends Error {}

export function bodyDigest(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('base64url');
}

function normalizePem(value: string): string {
  return value.replace(/\\+n/g, '\n').trim();
}

export async function brighamServiceKey(): Promise<CryptoKey | KeyObject> {
  const pem = process.env.BRIGHAM_SERVICE_PUBLIC_KEY;
  if (!pem) throw new AssertionError('BRIGHAM_SERVICE_PUBLIC_KEY is not set');
  return importSPKI(normalizePem(pem), 'EdDSA');
}

export type VerifiedAssertion = {
  shellOrgId: string;
  actor: { shellUserId: string; email: string };
  jti: string;
  expiresAt: Date;
};

export async function verifyBrighamAssertion(
  token: string,
  request: { method: string; path: string; body: string },
  key: CryptoKey | KeyObject,
  now = new Date(),
): Promise<VerifiedAssertion> {
  const { payload } = await jwtVerify(token, key, {
    issuer: BRIGHAM_SERVICE_ISSUER,
    audience: SERVICE_AUDIENCE,
    algorithms: ['EdDSA'],
    typ: SERVICE_JWT_TYPE,
    currentDate: now,
    clockTolerance: 5,
  });

  if (typeof payload.sub !== 'string' || !payload.sub.trim()) throw new AssertionError('no organization');
  if (typeof payload.jti !== 'string' || !payload.jti) throw new AssertionError('no jti');
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') throw new AssertionError('no iat/exp');
  if (payload.exp - payload.iat > SERVICE_MAX_TTL_SECONDS) throw new AssertionError('lifetime too long');
  if (payload.htm !== request.method.toUpperCase()) throw new AssertionError('method mismatch');
  if (payload.htu !== request.path) throw new AssertionError('path mismatch');
  if (payload.bdy !== bodyDigest(request.body)) throw new AssertionError('body mismatch');

  const act = payload.act as { sub?: unknown; email?: unknown } | undefined;
  if (!act || typeof act.sub !== 'string' || !act.sub.trim()) throw new AssertionError('no acting user');
  if (typeof act.email !== 'string' || !act.email.includes('@')) throw new AssertionError('no acting email');

  return {
    shellOrgId: payload.sub,
    actor: { shellUserId: act.sub, email: act.email.trim().toLowerCase() },
    jti: payload.jti,
    expiresAt: new Date(payload.exp * 1000),
  };
}

/*
 * Single-use jti. In memory: Chat runs as one container, and an assertion
 * lives ≤120s, so a restart can only re-open a two-minute window for a token
 * that was already delivered once.
 */
const seen = new Map<string, number>();

export function spendJti(jti: string, expiresAt: Date, now = Date.now()): boolean {
  for (const [k, exp] of seen) if (exp < now) seen.delete(k);
  if (seen.has(jti)) return false;
  seen.set(jti, expiresAt.getTime() + 5_000);
  return true;
}
