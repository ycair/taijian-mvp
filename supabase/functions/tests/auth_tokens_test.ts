import { assert, assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert@1';

Deno.env.set('JWT_SECRET', 'test-secret-at-least-32-characters-long');

import {
  createRefreshToken,
  hashRefreshToken,
  newSessionExpiry,
  signAccessToken,
  verifyAccessToken,
} from '../_shared/auth_tokens.ts';

Deno.test('refresh tokens are random base64url strings', () => {
  const first = createRefreshToken();
  const second = createRefreshToken();
  assert(first.length >= 40);
  assert(/^[A-Za-z0-9_-]+$/.test(first));
  assertNotEquals(first, second);
});

Deno.test('refresh tokens hash deterministically', async () => {
  const token = 'abc';
  const hash = await hashRefreshToken(token);
  assertEquals(hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assertEquals(await hashRefreshToken(token), hash);
  assertNotEquals(await hashRefreshToken('abcd'), hash);
});

Deno.test('session expiry is 30 days', () => {
  const now = new Date('2026-10-26T00:00:00.000Z');
  assertEquals(newSessionExpiry(now).toISOString(), '2026-11-25T00:00:00.000Z');
});

Deno.test('access token includes profile and session identity', async () => {
  const token = await signAccessToken('profile-1', 'session-1');
  const claims = await verifyAccessToken(token);
  assertEquals(claims?.profileId, 'profile-1');
  assertEquals(claims?.sessionId, 'session-1');
  assert(claims !== null);
});

Deno.test('access token rejects tampering and expiry', async () => {
  const token = await signAccessToken('profile-1', 'session-1');
  const parts = token.split('.');
  parts[2] = `${parts[2].startsWith('a') ? 'b' : 'a'}${parts[2].slice(1)}`;
  const tampered = parts.join('.');
  assertEquals(await verifyAccessToken(tampered), null);

  const short = await signAccessToken('profile-1', 'session-1', '1s');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assertEquals(await verifyAccessToken(short), null);
});

Deno.test('missing JWT secret fails closed', async () => {
  Deno.env.delete('JWT_SECRET');
  await assertRejects(() => signAccessToken('profile-1', 'session-1'), Error, 'JWT_SECRET');
  Deno.env.set('JWT_SECRET', 'test-secret-at-least-32-characters-long');
});
