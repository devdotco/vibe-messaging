// Attack checks for the Brigham → Chat assertion verifier. Run: npx tsx scripts/check-brigham-assertion.ts
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { verifyBrighamAssertion, bodyDigest, spendJti } from '../src/lib/brigham/assertion';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const other = generateKeyPairSync('ed25519');
const PATH = '/api/messaging/webhooks/brigham';
async function sign(o: { aud?: string; body?: string; path?: string; ttl?: number; key?: any; act?: any; sub?: string } = {}) {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ htm: 'POST', htu: o.path ?? PATH, bdy: bodyDigest(o.body ?? '{"a":1}'), act: o.act ?? { sub: 'u1', email: 'Nate@Dev.co' } })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'erp-service+jwt' }).setIssuer('https://app.erp.io/brigham')
    .setAudience(o.aud ?? 'chat').setSubject(o.sub ?? 'org1').setJti(randomUUID()).setIssuedAt(iat).setExpirationTime(iat + (o.ttl ?? 60))
    .sign(o.key ?? privateKey);
}
const req = { method: 'POST', path: PATH, body: '{"a":1}' };
let fails = 0;
async function expect(name: string, tok: Promise<string>, ok: boolean) {
  try { const v = await verifyBrighamAssertion(await tok, req, publicKey); if (!ok) { fails++; console.log('FAIL accepted', name); } else console.log('ok  ', name, v.actor.email); }
  catch (e) { if (ok) { fails++; console.log('FAIL rejected', name, (e as Error).message); } else console.log('ok   rejected', name, '-', (e as Error).message); }
}
(async () => {
  await expect('valid', sign(), true);
  await expect('aud=crm', sign({ aud: 'crm' }), false);
  await expect('body swapped', sign({ body: '{"a":2}' }), false);
  await expect('other path', sign({ path: '/api/messaging/webhooks/pm' }), false);
  await expect('ttl 600s', sign({ ttl: 600 }), false);
  await expect('wrong key', sign({ key: other.privateKey }), false);
  await expect('no act', sign({ act: {} }), false);
  const exp = new Date(Date.now() + 60_000);
  const first = spendJti('j1', exp), second = spendJti('j1', exp);
  console.log(first && !second ? 'ok   replay refused' : (fails++, 'FAIL replay'));
  process.exit(fails ? 1 : 0);
})();
