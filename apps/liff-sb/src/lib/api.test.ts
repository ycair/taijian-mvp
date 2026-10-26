import { describe, expect, it, vi } from 'vitest';
import {
  loginWithLine,
  logoutSession,
  refreshSessionToken,
  tokenExpiryMs,
} from './api';

describe('LIFF auth API', () => {
  it('reads the JWT expiry', () => {
    const payload = btoa(JSON.stringify({ exp: 12345 }));
    expect(tokenExpiryMs(`header.${payload}.signature`)).toBe(12345000);
    expect(tokenExpiryMs('not-a-jwt')).toBeNull();
  });

  it('uses the auth line action with the liff platform', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          accessToken: 'access',
          refreshToken: 'refresh',
          sessionId: 'session',
          userId: 'u1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await loginWithLine('line-id-token');

    expect(result.accessToken).toBe('access');
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain('/auth');
    expect(JSON.parse(call[1].body as string)).toEqual({
      action: 'line',
      idToken: 'line-id-token',
      platform: 'liff',
    });
  });

  it('refreshes and logs out with the auth action', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await refreshSessionToken('refresh');
    await logoutSession('access');

    const bodies = fetchMock.mock.calls.map((call) => {
      const init = (call as unknown as [string, RequestInit])[1];
      return JSON.parse(init.body as string);
    });
    expect(bodies).toEqual([
      { action: 'refresh', refreshToken: 'refresh' },
      { action: 'logout' },
    ]);
  });
});
