import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import { verifyToken } from './auth.ts';

const ISSUER = 'https://project.supabase.co/auth/v1';
const NOW = 1_800_000_000_000;
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

function token(claims: object = {}, header: object = {}, key = privateKey) {
  const h = enc({ alg: 'ES256', kid: 'k1', typ: 'JWT', ...header });
  const p = enc({ sub: 'user-1', iss: ISSUER, role: 'authenticated', exp: NOW / 1000 + 3600, ...claims });
  const sig = sign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${sig.toString('base64url')}`;
}

const options = {
  issuer: ISSUER,
  now: NOW,
  key: async (kid: string) => (kid === 'k1' ? publicKey : undefined),
};

describe('verifyToken', () => {
  it('returns the user id of a valid token', async () => {
    assert.equal(await verifyToken(token(), options), 'user-1');
  });

  it('rejects expired, foreign, anonymous-role and unsigned tokens', async () => {
    const bad = {
      expired: token({ exp: NOW / 1000 - 1 }),
      'other issuer': token({ iss: 'https://evil.supabase.co/auth/v1' }),
      'anon key': token({ role: 'anon' }),
      'unknown key id': token({}, { kid: 'k2' }),
      'wrong signer': token({}, {}, other.privateKey),
      'HS256 header': token({}, { alg: 'HS256' }),
      'alg none': token({}, { alg: 'none' }).split('.').slice(0, 2).join('.') + '.',
      garbage: 'not.a.token',
    };
    for (const [name, t] of Object.entries(bad)) assert.equal(await verifyToken(t, options), undefined, name);
  });

  it('rejects a token whose claims were changed after signing', async () => {
    const [h, , s] = token().split('.');
    const forged = `${h}.${enc({ sub: 'someone-else', iss: ISSUER, role: 'authenticated', exp: NOW / 1000 + 3600 })}.${s}`;
    assert.equal(await verifyToken(forged, options), undefined);
  });
});
