import { jwtVerify, createRemoteJWKSet, importSPKI, type JWTPayload } from 'jose';

/**
 * Verification of shell-issued module tokens.
 *
 * Chat holds only the PUBLIC half. It can check who is signed in at app.vb.co;
 * it can never mint a session for itself or for another module. The shell holds
 * the only private key, and every token names exactly one audience, so a token
 * minted for `pm` is rejected here.
 *
 * The audience is `messaging`, which is this module's key in the shell's
 * registry — not `chat`, which is only its display label and its hostname.
 *
 * Ported from the reference implementation in sdr-vb-co.
 */

export const AUDIENCE = 'messaging' as const;
const ALG = 'EdDSA';
const SHELL_URL_DEFAULT = 'https://app.vb.co';

export interface ShellIdentity {
  shellUserId: string;
  email: string;
  fullName: string;
  shellOrgId?: string;
  shellSessionId?: string;
}

export function shellUrl(): string {
  return (process.env.SHELL_URL ?? SHELL_URL_DEFAULT).replace(/\/$/, '');
}

/**
 * The issuer named in the token, which is NOT where the shell is served from.
 *
 * The shell stamps a fixed `iss` deliberately: it is a stable identity for the
 * signer, chosen so that moving the shell to another host does not invalidate
 * every token in flight. Verifying `iss` against SHELL_URL conflates the two,
 * and the two were the same string until the estate moved to erp.io. Every
 * hand-off then failed with `unexpected "iss" claim value`, this module bounced
 * the visitor back to its /sign-in, /sign-in sent them to the shell, and the
 * shell sent them straight back — which is what portal, crm, sign and canvas
 * did the day SHELL_URL was pointed at app.erp.io.
 *
 * Separate settings now, because they answer different questions. SHELL_URL is
 * an address: where to send a browser, where to fetch the public keys.
 * SHELL_TOKEN_ISSUER is a name: who signed this.
 */
const TOKEN_ISSUER_DEFAULT = 'https://app.vb.co';

export function tokenIssuer(): string {
  return (process.env.SHELL_TOKEN_ISSUER ?? TOKEN_ISSUER_DEFAULT).replace(/\/$/, '');
}

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Accept a PEM however the deploy platform stored its newlines. Coolify writes
 * env vars into the Dockerfile as `ARG NAME=value`, so a key with real
 * newlines breaks the build; stored single-line it comes back escaped, and its
 * own escaping can double the backslash.
 */
function normalizePem(value: string): string {
  return value.replace(/\\+n/g, '\n').trim();
}

async function verificationKey() {
  const pinned = process.env.MODULE_TOKEN_PUBLIC_KEY;
  if (pinned) return importSPKI(normalizePem(pinned), ALG);

  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(`${shellUrl()}/.well-known/jwks.json`), {
      cacheMaxAge: 60 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    });
  }
  return remoteJwks;
}

/**
 * Verify a hand-off token. Throws on anything suspect — expired, minted for
 * another module, signed by a key we do not trust. Callers must treat a throw
 * as "not signed in", never as a soft failure.
 */
export async function verifyModuleToken(token: string): Promise<ShellIdentity> {
  const key = await verificationKey();

  const { payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], {
    issuer: tokenIssuer(),
    audience: AUDIENCE,
    algorithms: [ALG],
    clockTolerance: 5,
  });

  return toIdentity(payload);
}

function toIdentity(payload: JWTPayload): ShellIdentity {
  const { sub, email, name, org, sid } = payload as JWTPayload & {
    email?: unknown; name?: unknown; org?: unknown; sid?: unknown;
  };

  if (typeof sub !== 'string' || !sub) throw new Error('Module token has no subject');
  if (typeof email !== 'string' || !email) throw new Error('Module token has no email');

  return {
    shellUserId: sub,
    email,
    fullName: typeof name === 'string' ? name : '',
    shellOrgId: typeof org === 'string' ? org : undefined,
    shellSessionId: typeof sid === 'string' ? sid : undefined,
  };
}

/** Where to send someone who is not signed in at all. */
export function shellSignInUrl(returnTo: string): string {
  return `${shellUrl()}/sign-in?next=${encodeURIComponent(returnTo)}`;
}
