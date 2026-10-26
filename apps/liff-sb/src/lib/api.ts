import { functionsUrl, supabaseAnonKey } from './supabase';

export type CommandResult<T = unknown> =
  | { ok: true; commandId: string; revision?: number; data: T; serverTime: string }
  | {
      ok: false;
      commandId: string;
      code: string;
      message: string;
      current?: unknown;
      currentRevision?: number;
      serverTime: string;
    };

export async function callCommand<T = unknown>(
  token: string,
  command: {
    commandId: string;
    type: string;
    householdId?: string;
    baseRevision?: number;
    payload: Record<string, unknown>;
  },
): Promise<CommandResult<T>> {
  const send = (accessToken: string) =>
    fetch(`${functionsUrl}/execute-command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: supabaseAnonKey,
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ...command,
        client: { platform: 'liff', appVersion: '0.1.0' },
      }),
    });

  let response = await send(token);
  if (response.status === 401) {
    const refreshToken = localStorage.getItem('sb_refresh');
    if (refreshToken) {
      const refreshed = await refreshSessionToken(refreshToken);
      if (refreshed.ok && refreshed.accessToken && refreshed.refreshToken) {
        localStorage.setItem('sb_access', refreshed.accessToken);
        localStorage.setItem('sb_refresh', refreshed.refreshToken);
        if (refreshed.userId) localStorage.setItem('sb_user', refreshed.userId);
        response = await send(refreshed.accessToken);
      }
    }
  }
  return (await response.json()) as CommandResult<T>;
}

export type LineLoginResponse = {
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  token?: string;
  userId?: string;
  profile?: {
    id: string;
    displayName: string;
    timezone: string;
    defaultHouseholdId: string | null;
  };
  message?: string;
};

export type RefreshResponse = {
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  userId?: string;
  profile?: LineLoginResponse['profile'];
  message?: string;
};

export async function loginWithLine(idToken: string): Promise<LineLoginResponse> {
  const response = await fetch(`${functionsUrl}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: supabaseAnonKey },
    body: JSON.stringify({ action: 'line', idToken, platform: 'liff' }),
  });
  return (await response.json()) as LineLoginResponse;
}

export async function refreshSessionToken(refreshToken: string): Promise<RefreshResponse> {
  const response = await fetch(`${functionsUrl}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: supabaseAnonKey },
    body: JSON.stringify({ action: 'refresh', refreshToken }),
  });
  return (await response.json()) as RefreshResponse;
}

export async function logoutSession(token: string): Promise<void> {
  await fetch(`${functionsUrl}/auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: supabaseAnonKey,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'logout' }),
  });
}

export function tokenExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadPart = parts[1];
  if (!payloadPart) return null;
  try {
    const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function newCommandId(): string {
  return crypto.randomUUID();
}
