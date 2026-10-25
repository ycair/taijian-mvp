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
  const response = await fetch(`${functionsUrl}/execute-command`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: supabaseAnonKey,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...command,
      client: { platform: 'liff', appVersion: '0.1.0' },
    }),
  });
  return (await response.json()) as CommandResult<T>;
}

export type LineLoginResponse = {
  ok: boolean;
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

export async function loginWithLine(idToken: string): Promise<LineLoginResponse> {
  const response = await fetch(`${functionsUrl}/line-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: supabaseAnonKey },
    body: JSON.stringify({ idToken }),
  });
  return (await response.json()) as LineLoginResponse;
}

export function newCommandId(): string {
  return crypto.randomUUID();
}
