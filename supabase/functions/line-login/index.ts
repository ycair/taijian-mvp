import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { signUserToken } from '../_shared/jwt.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const lineChannelId = Deno.env.get('LINE_LOGIN_CHANNEL_ID') ?? 'test-login-channel';
const allowMockLine = Deno.env.get('ALLOW_MOCK_LINE') === 'true';

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type LineProfile = { sub: string; name?: string; picture?: string };

async function verifyLineToken(idToken: string): Promise<LineProfile> {
  if (idToken.startsWith('mock:')) {
    if (!allowMockLine) throw new Error('mock LINE login is disabled');
    const sub = idToken.slice('mock:'.length);
    return { sub, name: `Mock ${sub}`, picture: '' };
  }
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: lineChannelId }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('LINE token verification failed');
  const data = (await response.json()) as {
    aud?: string;
    sub?: string;
    name?: string;
    picture?: string;
    exp?: number;
  };
  if (data.aud !== lineChannelId || !data.sub) {
    throw new Error('LINE token audience mismatch');
  }
  if (typeof data.exp !== 'number' || data.exp * 1000 <= Date.now()) {
    throw new Error('LINE token expired');
  }
  return { sub: data.sub, name: data.name, picture: data.picture };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken || idToken.length > 4096) {
      return json({ ok: false, code: 'VALIDATION_ERROR', message: 'idToken required' });
    }
    const line = await verifyLineToken(idToken);

    const { data: existing, error: findError } = await admin
      .from('profiles')
      .select('id, display_name, avatar_url, timezone, default_household_id')
      .eq('line_sub', line.sub)
      .maybeSingle();
    if (findError) throw findError;

    let profile = existing;
    if (!profile) {
      const id = crypto.randomUUID();
      const { data: created, error: createError } = await admin
        .from('profiles')
        .insert({
          id,
          line_sub: line.sub,
          display_name: line.name ?? '新朋友',
          avatar_url: line.picture ?? '',
          timezone: 'Asia/Taipei',
        })
        .select('id, display_name, avatar_url, timezone, default_household_id')
        .single();
      if (createError) throw createError;
      profile = created;
    } else {
      await admin
        .from('profiles')
        .update({
          display_name: existing.display_name || line.name || '新朋友',
          avatar_url: existing.avatar_url || line.picture || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
    }

    await admin.from('line_users').upsert(
      {
        line_sub: line.sub,
        user_id: profile.id,
        status: 'active',
        display_name: line.name ?? '',
        picture_url: line.picture ?? '',
        linked_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'line_sub' },
    );

    const token = await signUserToken(profile.id);
    return json({
      ok: true,
      token,
      userId: profile.id,
      profile: {
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        timezone: profile.timezone,
        defaultHouseholdId: profile.default_household_id,
      },
    });
  } catch (error) {
    return json({
      ok: false,
      code: 'UNAUTHENTICATED',
      message: error instanceof Error ? error.message : 'LINE login failed',
    });
  }
});
