import { assertEquals } from 'jsr:@std/assert@1';

Deno.env.set('SUPABASE_DB_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
Deno.env.set('JWT_SECRET', 'test-secret-at-least-32-characters-long');
Deno.env.set('ALLOW_MOCK_LINE', 'true');

const http = await import('../_shared/auth_http.ts');
const service = await import('../_shared/auth_service.ts');
const { sql } = await import('../_shared/db.ts');

function request(body: unknown, token?: string): Request {
  return new Request('http://localhost/functions/v1/auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test('auth HTTP line action returns a session', async () => {
  const response = await http.handleAuth(request({
    action: 'line',
    idToken: 'mock:UtestA',
    platform: 'ios',
  }));
  const body = await response.json() as Record<string, any>;
  try {
    assertEquals(response.status, 200);
    assertEquals(body.ok, true);
    assertEquals(body.userId, '00000000-0000-4000-8000-00000000000a');
    assertEquals(typeof body.accessToken, 'string');
    assertEquals(typeof body.refreshToken, 'string');
  } finally {
    await sql`delete from public.auth_sessions where profile_id = ${body.userId}`;
  }
});

Deno.test('auth HTTP refresh rotates and logout revokes', async () => {
  const login = await service.loginWithProvider('guest', crypto.randomUUID(), { displayName: 'HTTP' }, 'ios');
  try {
    const refreshResponse = await http.handleAuth(request({
      action: 'refresh',
      refreshToken: login.refreshToken,
    }));
    const refreshed = await refreshResponse.json() as Record<string, any>;
    assertEquals(refreshed.ok, true);
    assertEquals(refreshed.sessionId, login.sessionId);

    const logoutResponse = await http.handleAuth(
      request({ action: 'logout' }, refreshed.accessToken),
    );
    const logout = await logoutResponse.json() as Record<string, any>;
    assertEquals(logout.ok, true);

    const [session] = await sql`
      select revoked_at from public.auth_sessions where id = ${login.sessionId}
    `;
    assertEquals(session.revoked_at !== null, true);
  } finally {
    await sql`delete from public.profiles where id = ${login.userId}`;
  }
});
