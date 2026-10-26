import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callCommand,
  loginWithLine,
  logoutSession,
  refreshSessionToken,
  tokenExpiryMs,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LIFF auth API', () => {
  it('reads the JWT expiry', () => {
    const payload = btoa(JSON.stringify({ exp: 12345 }));
    expect(tokenExpiryMs(`header.${payload}.signature`)).toBe(12345000);
    expect(tokenExpiryMs('not-a-jwt')).toBeNull();
  });

  it('uses the auth line action with the liff platform', async () => {
    const fetchMock = vi.fn(
      async () =>
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
    const fetchMock = vi.fn(
      async () =>
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
    expect(bodies).toEqual([{ action: 'refresh', refreshToken: 'refresh' }, { action: 'logout' }]);
  });

  it('refreshes once and retries a 401 command', async () => {
    const storage = new Map<string, string>([
      ['sb_access', 'expired'],
      ['sb_refresh', 'refresh'],
      ['sb_user', 'u1'],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    let executeCalls = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/execute-command')) {
        executeCalls += 1;
        if (executeCalls === 1) {
          return new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 });
        }
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer fresh');
        return new Response(
          JSON.stringify({
            ok: true,
            commandId: 'cmd-1',
            data: { recordId: 'r1' },
            serverTime: 'now',
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          accessToken: 'fresh',
          refreshToken: 'fresh-refresh',
          sessionId: 's1',
          userId: 'u1',
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callCommand('expired', {
      commandId: 'cmd-1',
      type: 'record.create',
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(executeCalls).toBe(2);
    expect(storage.get('sb_access')).toBe('fresh');
    expect(storage.get('sb_refresh')).toBe('fresh-refresh');
  });
});
