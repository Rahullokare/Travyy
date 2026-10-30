import { createPublicKey, verify, type JsonWebKeyInput, type KeyObject } from 'node:crypto';

/**
 * Supabase access tokens, checked locally: the project signs them with ES256 and publishes the
 * public keys, so no call to Supabase per request. Signing in is optional; a missing or bad
 * token just means an anonymous request.
 */
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');

export type KeyLookup = (kid: string) => Promise<KeyObject | undefined>;

const b64url = (s: string) => Buffer.from(s, 'base64url');

function decode(part: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(b64url(part).toString('utf8'));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** The user id (`sub`) of a valid, unexpired access token signed by `issuer`, else undefined. */
export async function verifyToken(
  token: string,
  { issuer, key, now = Date.now() }: { issuer: string; key: KeyLookup; now?: number },
): Promise<string | undefined> {
  const [h, p, sig, extra] = token.split('.');
  if (!h || !p || !sig || extra !== undefined) return undefined;
  const header = decode(h);
  const claims = decode(p);
  if (header?.alg !== 'ES256' || typeof header.kid !== 'string' || !claims) return undefined;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return undefined;
  if (claims.iss !== issuer || claims.role !== 'authenticated' || typeof claims.sub !== 'string')
    return undefined;
  const publicKey = await key(header.kid);
  if (!publicKey) return undefined;
  const valid = verify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    b64url(sig),
  );
  return valid ? claims.sub : undefined;
}

const KEYS_TTL_MS = 10 * 60_000;
let keys = new Map<string, KeyObject>();
let keysFetchedAt = 0;

/** The project's signing keys, cached; refetched (at most once a minute) for an unknown key id. */
async function supabaseKey(kid: string): Promise<KeyObject | undefined> {
  const age = Date.now() - keysFetchedAt;
  if (!keys.has(kid) || age > KEYS_TTL_MS) {
    if (age > 60_000) {
      keysFetchedAt = Date.now();
      try {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
          signal: AbortSignal.timeout(5_000),
        });
        const body = (await r.json()) as { keys?: (JsonWebKeyInput['key'] & { kid?: string })[] };
        keys = new Map(
          (body.keys ?? [])
            .filter((k) => k.kid)
            .map((k) => [k.kid!, createPublicKey({ key: k, format: 'jwk' })]),
        );
      } catch {
        // Keep the old keys; requests count as anonymous until Supabase answers.
      }
    }
  }
  return keys.get(kid);
}

/** The signed-in user's id from an `Authorization: Bearer` header, or undefined. */
export async function userIdFrom(authorization: string | undefined): Promise<string | undefined> {
  if (!SUPABASE_URL || !authorization?.startsWith('Bearer ')) return undefined;
  return verifyToken(authorization.slice(7).trim(), { issuer: `${SUPABASE_URL}/auth/v1`, key: supabaseKey });
}
