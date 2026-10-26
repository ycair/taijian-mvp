import { SignJWT, jwtVerify } from 'npm:jose@6';

const ACCESS_AUDIENCE = 'authenticated';
const REFRESH_BYTES = 32;
const SESSION_DAYS = 30;

export type AccessClaims = {
  profileId: string;
  sessionId: string;
};

function secret(): Uint8Array {
  const value = Deno.env.get('JWT_SECRET');
  if (!value) throw new Error('JWT_SECRET is required');
  return new TextEncoder().encode(value);
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createRefreshToken(): string {
  const bytes = new Uint8Array(REFRESH_BYTES);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function hashRefreshToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newSessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export async function signAccessToken(
  profileId: string,
  sessionId: string,
  expiresIn: string | number = '1h',
): Promise<string> {
  return await new SignJWT({ role: ACCESS_AUDIENCE, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(profileId)
    .setAudience(ACCESS_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: ACCESS_AUDIENCE });
    const profileId = typeof payload.sub === 'string' ? payload.sub : null;
    const sessionId = typeof payload.sid === 'string' ? payload.sid : null;
    if (!profileId || !sessionId) return null;
    return { profileId, sessionId };
  } catch {
    return null;
  }
}

export async function verifyAccessTokenFromRequest(request: Request): Promise<AccessClaims | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return await verifyAccessToken(token);
}
