import { jwtVerify, SignJWT } from 'npm:jose@6';

const secretValue =
  Deno.env.get('JWT_SECRET') ??
  'super-secret-jwt-token-with-at-least-32-characters-long';
const secret = new TextEncoder().encode(secretValue);

export async function signUserToken(userId: string): Promise<string> {
  return await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret);
}

export async function verifyUserToken(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: 'authenticated' });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
