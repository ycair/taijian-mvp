import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

Deno.env.set('LINE_LOGIN_CHANNEL_ID', 'line-channel-1');
Deno.env.set('GOOGLE_SERVER_CLIENT_ID', 'google-server-1.apps.googleusercontent.com');

import {
  AuthProviderError,
  verifyGoogleToken,
  verifyLineToken,
} from '../_shared/auth_providers.ts';

const validLine = {
  aud: 'line-channel-1',
  sub: 'Uline-1',
  exp: Math.floor(Date.now() / 1000) + 3600,
  name: 'LINE User',
  picture: 'https://example.com/line.png',
};

const validGoogle = {
  aud: 'google-server-1.apps.googleusercontent.com',
  sub: 'google-1',
  exp: String(Math.floor(Date.now() / 1000) + 3600),
  name: 'Google User',
  picture: 'https://example.com/google.png',
  email: 'user@example.com',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.test('LINE verifier accepts the configured audience', async () => {
  let requestUrl = '';
  let requestMethod = '';
  const result = await verifyLineToken('line-id-token', (input, init) => {
    const request = new Request(input, init);
    requestUrl = request.url;
    requestMethod = request.method;
    return Promise.resolve(jsonResponse(validLine));
  });

  assertEquals(result.subject, 'Uline-1');
  assertEquals(result.name, 'LINE User');
  assertEquals(requestUrl, 'https://api.line.me/oauth2/v2.1/verify');
  assertEquals(requestMethod, 'POST');
});

Deno.test('LINE verifier rejects wrong audience and expired tokens', async () => {
  await assertRejects(
    () => verifyLineToken('token', () => Promise.resolve(jsonResponse({ ...validLine, aud: 'wrong' }))),
    AuthProviderError,
    'UNAUTHENTICATED',
  );
  await assertRejects(
    () =>
      verifyLineToken('token', () =>
        Promise.resolve(jsonResponse({ ...validLine, exp: Math.floor(Date.now() / 1000) - 1 })),
      ),
    AuthProviderError,
    'UNAUTHENTICATED',
  );
});

Deno.test('Google verifier accepts the server audience', async () => {
  let requestUrl = '';
  const result = await verifyGoogleToken('google-id-token', (input, init) => {
    requestUrl = new Request(input, init).url;
    return Promise.resolve(jsonResponse(validGoogle));
  });

  assertEquals(result.subject, 'google-1');
  assertEquals(result.email, 'user@example.com');
  assertEquals(requestUrl, 'https://oauth2.googleapis.com/tokeninfo?id_token=google-id-token');
});

Deno.test('Google verifier rejects wrong audience, expiry, and malformed responses', async () => {
  await assertRejects(
    () =>
      verifyGoogleToken('token', () =>
        Promise.resolve(jsonResponse({ ...validGoogle, aud: 'ios-client.apps.googleusercontent.com' })),
      ),
    AuthProviderError,
    'UNAUTHENTICATED',
  );
  await assertRejects(
    () => verifyGoogleToken('token', () => Promise.resolve(jsonResponse({ ...validGoogle, exp: '0' }))),
    AuthProviderError,
    'UNAUTHENTICATED',
  );
  await assertRejects(
    () => verifyGoogleToken('token', () => Promise.resolve(jsonResponse({ aud: validGoogle.aud }))),
    AuthProviderError,
    'UNAUTHENTICATED',
  );
});

Deno.test('provider HTTP failures are generic authentication errors', async () => {
  await assertRejects(
    () => verifyLineToken('token', () => Promise.resolve(jsonResponse({}, 500))),
    AuthProviderError,
    'UNAUTHENTICATED',
  );
  await assertRejects(
    () => verifyGoogleToken('token', () => Promise.resolve(jsonResponse({}, 401))),
    AuthProviderError,
    'UNAUTHENTICATED',
  );
});
