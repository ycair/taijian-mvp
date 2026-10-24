/**
 * Minimal stand-in for the LINE Platform used by local E2E runs.
 *
 *   pnpm mock:line
 *
 * It implements the two calls the backend makes:
 *   POST /oauth2/v2.1/verify  (ID token verification, form encoded)
 *   ANY  /v2/bot/message/*    (push / reply, accepted and ignored)
 *
 * Only the seeded tokens are accepted: `test-token-A` → UtestA and
 * `test-token-B` → UtestB. Anything else gets the same 401 LINE returns for an
 * invalid token, so the suite cannot accidentally pass on a typo'd token. The
 * response mirrors the fields LINE returns, so `verifyLineIdToken` validates
 * `aud`, `iss`, `exp`, and `sub` exactly as it would against production.
 *
 * Bound to 127.0.0.1: this server must never be reachable from the network.
 */
import { createServer } from 'node:http';

const host = process.env.MOCK_LINE_HOST ?? '127.0.0.1';
const port = Number(process.env.MOCK_LINE_PORT ?? 4010);
/** Must match `LINE_LOGIN_CHANNEL_ID` in `services/functions/.env`. */
const channelId = process.env.MOCK_LINE_CHANNEL_ID ?? 'test-login-channel';

const profiles: Record<string, { name: string }> = {
  'test-token-A': { name: 'Test A' },
  'test-token-B': { name: 'Test B' },
};

createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString('utf8');

  if (request.url?.startsWith('/oauth2/v2.1/verify')) {
    const params = new URLSearchParams(body);
    const idToken = params.get('id_token');
    const profile = idToken === null ? undefined : profiles[idToken];
    if (!profile) {
      response.statusCode = 401;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({ error: 'invalid_request', error_description: 'invalid id_token' }),
      );
      return;
    }

    const sub = idToken === 'test-token-B' ? 'UtestB' : 'UtestA';
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        aud: channelId,
        iss: 'https://access.line.me',
        sub,
        name: profile.name,
        picture: '',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    return;
  }

  if (request.url?.startsWith('/v2/bot/')) {
    response.setHeader('content-type', 'application/json');
    response.end('{}');
    return;
  }

  response.statusCode = 404;
  response.end('not found');
}).listen(port, host, () => console.log(`mock LINE server on http://${host}:${port}`));
