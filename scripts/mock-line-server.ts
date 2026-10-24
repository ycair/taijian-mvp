/**
 * Minimal stand-in for the LINE Platform used by local E2E runs.
 *
 *   pnpm mock:line
 *
 * It implements the two calls the backend makes:
 *   POST /oauth2/v2.1/verify  (ID token verification, form encoded)
 *   ANY  /v2/bot/message/*    (push / reply, accepted and ignored)
 *
 * Tokens map to the seeded users: `test-token-A` → UtestA,
 * `test-token-B` → UtestB; anything else falls back to UtestA. The response
 * mirrors the fields LINE returns so `verifyLineIdToken` can validate
 * `aud`, `iss`, `exp`, and `sub` exactly as it would against production.
 */
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_LINE_PORT ?? 4010);
/** Must match `LINE_LOGIN_CHANNEL_ID` in `services/functions/.env`. */
const channelId = process.env.MOCK_LINE_CHANNEL_ID ?? 'test-login-channel';

createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString('utf8');

  if (request.url?.startsWith('/oauth2/v2.1/verify')) {
    const params = new URLSearchParams(body);
    const idToken = params.get('id_token');
    const sub = idToken === 'test-token-B' ? 'UtestB' : 'UtestA';
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        aud: channelId,
        iss: 'https://access.line.me',
        sub,
        name: sub === 'UtestB' ? 'Test B' : 'Test A',
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
}).listen(port, () => console.log(`mock LINE server on http://localhost:${port}`));
