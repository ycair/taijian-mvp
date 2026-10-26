import { corsHeaders, json } from './http.ts';
import { AuthProviderError, verifyGoogleToken, verifyLineToken } from './auth_providers.ts';
import { AuthServiceError, deleteAccount, linkIdentity, listIdentities, loginAsGuest, loginWithProvider, logout, refreshSession, unlinkIdentity } from './auth_service.ts';
import { verifyAccessTokenFromRequest } from './auth_tokens.ts';
import { sql } from './db.ts';

type Platform = 'ios' | 'liff';

function platform(value: unknown, fallback: Platform = 'ios'): Platform {
  return value === 'liff' ? 'liff' : fallback;
}

async function allowAttempt(bucket: string, limit: number, windowSeconds = 60): Promise<boolean> {
  const key = `${bucket}:${new Date().toISOString().slice(0, 16)}`;
  return await sql.begin(async (tx: any) => {
    const [row] = await tx`
      select window_start, counts from public.rate_limits where bucket = ${key} for update
    `;
    const now = Date.now();
    if (!row) {
      await tx`
        insert into public.rate_limits (bucket, window_start, counts, expires_at)
        values (${key}, now(), ${tx.json({ count: 1 })}, now() + interval '10 minutes')
      `;
      return true;
    }
    const windowStart = new Date(row.window_start).getTime();
    if (now - windowStart >= windowSeconds * 1000) {
      await tx`
        update public.rate_limits
        set window_start = now(), counts = ${tx.json({ count: 1 })}, expires_at = now() + interval '10 minutes'
        where bucket = ${key}
      `;
      return true;
    }
    const count = Number((row.counts as { count?: number })?.count ?? 0);
    if (count >= limit) return false;
    await tx`
      update public.rate_limits
      set counts = ${tx.json({ count: count + 1 })}, expires_at = now() + interval '10 minutes'
      where bucket = ${key}
    `;
    return true;
  });
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
}

function errorResponse(error: unknown): Response {
  if (error instanceof AuthProviderError || error instanceof AuthServiceError) {
    return json({ ok: false, code: error.code, message: error.code });
  }
  console.error('auth request failed', error instanceof Error ? error.message : error);
  return json({ ok: false, code: 'INTERNAL', message: 'INTERNAL' });
}

async function loginLine(idToken: string, platformValue: Platform) {
  const line = await verifyLineToken(idToken);
  return await loginWithProvider(
    'line',
    line.subject,
    { displayName: line.name, avatarUrl: line.picture },
    platformValue,
  );
}

export async function handleAuth(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'METHOD_NOT_ALLOWED' });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR' });
  }
  const action = typeof body.action === 'string' ? body.action : 'line';
  const ip = clientIp(request);

  try {
    switch (action) {
      case 'line': {
        if (!(await allowAttempt(`auth:line:${ip}`, 30))) {
          return json({ ok: false, code: 'RATE_LIMITED', message: 'RATE_LIMITED' });
        }
        const idToken = typeof body.idToken === 'string' ? body.idToken : '';
        if (!idToken) return json({ ok: false, code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR' });
        return json({ ok: true, ...(await loginLine(idToken, platform(body.platform, 'liff'))) });
      }

      case 'google': {
        if (!(await allowAttempt(`auth:google:${ip}`, 30))) {
          return json({ ok: false, code: 'RATE_LIMITED', message: 'RATE_LIMITED' });
        }
        const idToken = typeof body.idToken === 'string' ? body.idToken : '';
        if (!idToken) return json({ ok: false, code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR' });
        const google = await verifyGoogleToken(idToken);
        const result = await loginWithProvider(
          'google',
          google.subject,
          { displayName: google.name, avatarUrl: google.picture },
          platform(body.platform),
        );
        return json({ ok: true, ...result });
      }

      case 'guest': {
        if (platform(body.platform) !== 'ios') {
          return json({ ok: false, code: 'FORBIDDEN', message: 'guest is iOS-only' });
        }
        if (!(await allowAttempt(`auth:guest:${ip}`, 5))) {
          return json({ ok: false, code: 'RATE_LIMITED', message: 'RATE_LIMITED' });
        }
        return json({ ok: true, ...(await loginAsGuest('ios')) });
      }

      case 'refresh': {
        const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : '';
        if (!refreshToken) return json({ ok: false, code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR' });
        if (!(await allowAttempt(`auth:refresh:${ip}`, 120))) {
          return json({ ok: false, code: 'RATE_LIMITED', message: 'RATE_LIMITED' });
        }
        return json({ ok: true, ...(await refreshSession(refreshToken)) });
      }

      case 'link': {
        const claims = await verifyAccessTokenFromRequest(request);
        if (!claims) return json({ ok: false, code: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' });
        const provider = body.provider;
        const idToken = typeof body.idToken === 'string' ? body.idToken : '';
        if ((provider !== 'line' && provider !== 'google') || !idToken) {
          return json({ ok: false, code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR' });
        }
        const verified = provider === 'line'
          ? await verifyLineToken(idToken)
          : await verifyGoogleToken(idToken);
        await linkIdentity(claims.profileId, provider, verified.subject);
        return json({ ok: true });
      }

      case 'unlink': {
        const claims = await verifyAccessTokenFromRequest(request);
        if (!claims) return json({ ok: false, code: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' });
        const provider = body.provider;
        if (provider !== 'line' && provider !== 'google') {
          return json({ ok: false, code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR' });
        }
        await unlinkIdentity(claims.profileId, provider);
        return json({ ok: true });
      }

      case 'identities': {
        const claims = await verifyAccessTokenFromRequest(request);
        if (!claims) return json({ ok: false, code: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' });
        return json({ ok: true, providers: await listIdentities(claims.profileId) });
      }

      case 'logout': {
        const claims = await verifyAccessTokenFromRequest(request);
        if (!claims) return json({ ok: false, code: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' });
        await logout(claims.profileId, claims.sessionId);
        return json({ ok: true });
      }

      case 'delete': {
        const claims = await verifyAccessTokenFromRequest(request);
        if (!claims) return json({ ok: false, code: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' });
        if (body.confirm !== 'DELETE') {
          return json({ ok: false, code: 'VALIDATION_ERROR', message: 'confirmation required' });
        }
        await deleteAccount(claims.profileId);
        return json({ ok: true });
      }

      default:
        return json({ ok: false, code: 'VALIDATION_ERROR', message: 'unknown action' });
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleLineLoginCompatibility(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await request.json()) as { idToken?: string };
    if (!body.idToken) return json({ ok: false, code: 'VALIDATION_ERROR', message: 'idToken required' });
    const result = await loginLine(body.idToken, 'liff');
    return json({
      ok: true,
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      sessionId: result.sessionId,
      userId: result.userId,
      profile: result.profile,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
