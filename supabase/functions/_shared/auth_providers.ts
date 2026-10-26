export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ProviderProfile = {
  subject: string;
  name?: string;
  picture?: string;
  email?: string;
};

export class AuthProviderError extends Error {
  constructor(public readonly code: 'UNAUTHENTICATED' | 'CONFIG') {
    super(code);
    this.name = 'AuthProviderError';
  }
}

function requireConfig(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new AuthProviderError('CONFIG');
  return value;
}

function unauthenticated(): never {
  throw new AuthProviderError('UNAUTHENTICATED');
}

function futureExpiry(exp: number): boolean {
  return Number.isFinite(exp) && exp * 1000 > Date.now();
}

export async function verifyLineToken(
  idToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderProfile> {
  const channelId = requireConfig('LINE_LOGIN_CHANNEL_ID');
  let response: Response;
  try {
    response = await fetchImpl('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return unauthenticated();
  }
  if (!response.ok) return unauthenticated();

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    return unauthenticated();
  }
  const aud = typeof data.aud === 'string' ? data.aud : '';
  const subject = typeof data.sub === 'string' ? data.sub : '';
  const exp = typeof data.exp === 'number' ? data.exp : 0;
  if (aud !== channelId || !subject || !futureExpiry(exp)) return unauthenticated();

  return {
    subject,
    name: typeof data.name === 'string' ? data.name : undefined,
    picture: typeof data.picture === 'string' ? data.picture : undefined,
  };
}

export async function verifyGoogleToken(
  idToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderProfile> {
  const serverClientId = requireConfig('GOOGLE_SERVER_CLIENT_ID');
  let response: Response;
  try {
    response = await fetchImpl(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { signal: AbortSignal.timeout(5000) },
    );
  } catch {
    return unauthenticated();
  }
  if (!response.ok) return unauthenticated();

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    return unauthenticated();
  }

  const aud = typeof data.aud === 'string' ? data.aud : '';
  const subject = typeof data.sub === 'string' ? data.sub : '';
  const exp = typeof data.exp === 'string' ? Number(data.exp) : 0;
  if (aud !== serverClientId || !subject || !futureExpiry(exp)) return unauthenticated();

  return {
    subject,
    name: typeof data.name === 'string' ? data.name : undefined,
    picture: typeof data.picture === 'string' ? data.picture : undefined,
    email: typeof data.email === 'string' ? data.email : undefined,
  };
}
