import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@taijian/domain';
import { config } from '../config';
import { createTtlCache } from '../lib/memo';

/** Issuer LINE puts in every ID token it mints. */
export const LINE_ISSUER = 'https://access.line.me';

export type LineProfile = {
  sub: string;
  name?: string;
  picture?: string;
};

type LineVerifyResponse = {
  aud?: string;
  sub?: string;
  name?: string;
  picture?: string;
  iss?: string;
  exp?: number;
};

/**
 * Verifies the `x-line-signature` header of a webhook request. LINE signs the
 * raw request body with the channel secret, so callers must pass the
 * unparsed body.
 */
export function verifyLineSignature(
  rawBody: Buffer | string,
  channelSecret: string,
  signature: string,
): boolean {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
  const expected = createHmac('sha256', channelSecret).update(body).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Exchanges a LIFF/LINE Login ID token for its profile. LINE's verification
 * endpoint checks the signature, the issuer (`https://access.line.me`), and the
 * expiry; we re-check `aud`, `iss`, `exp`, and `sub` so a misconfigured
 * endpoint or a proxied response cannot mint a session for another channel.
 */
export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
  verifyUrl = config.LINE_VERIFY_URL,
): Promise<LineProfile> {
  let response: Response;
  try {
    response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new AppError('UNAUTHENTICATED', 'LINE token verification unavailable');
  }
  if (!response.ok) {
    throw new AppError('UNAUTHENTICATED', 'LINE token verification failed');
  }

  let data: LineVerifyResponse;
  try {
    data = (await response.json()) as LineVerifyResponse;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'LINE token verification failed');
  }

  if (data.aud !== channelId || !data.sub) {
    throw new AppError('UNAUTHENTICATED', 'LINE token audience mismatch');
  }
  if (data.iss !== LINE_ISSUER) {
    throw new AppError('UNAUTHENTICATED', 'LINE token issuer mismatch');
  }
  if (typeof data.exp !== 'number' || data.exp * 1000 <= Date.now()) {
    throw new AppError('UNAUTHENTICATED', 'LINE token expired');
  }

  return {
    sub: data.sub,
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.picture !== undefined ? { picture: data.picture } : {}),
  };
}

const profileCache = createTtlCache<LineProfile>();

/**
 * Memoized equivalent of {@link verifyLineIdToken}. `lineLogin` and `linkLine`
 * both run inside retried Firestore transactions, so the same ID token must not
 * be exchanged with LINE once per attempt.
 */
export function verifiedLineProfile(
  idToken: string,
  channelId = config.LINE_LOGIN_CHANNEL_ID,
): Promise<LineProfile> {
  // The cache key hashes the token so a bearer credential is not retained as a
  // plaintext Map key in a warm instance.
  const tokenKey = createHash('sha256').update(idToken).digest('hex');
  return profileCache.get(`${channelId}:${tokenKey}`, () => verifyLineIdToken(idToken, channelId));
}

/** Test hook: drop memoized ID-token exchanges. */
export function clearLineVerifyCache(): void {
  profileCache.clear();
}
