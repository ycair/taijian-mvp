import { createRefreshToken, hashRefreshToken, newSessionExpiry, signAccessToken } from './auth_tokens.ts';
import { sql } from './db.ts';

export type AuthPlatform = 'ios' | 'liff';
export type LoginProvider = 'line' | 'google' | 'guest';
export type LinkProvider = 'line' | 'google';

export type AuthProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
  defaultHouseholdId: string | null;
};

export type AuthLoginResult = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  userId: string;
  profile: AuthProfile;
};

export type IdentityProfileInput = {
  displayName?: string;
  avatarUrl?: string | null;
  timezone?: string;
};

export class AuthServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AuthServiceError';
  }
}

function profileFromRow(row: any): AuthProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    defaultHouseholdId: row.default_household_id,
  };
}

function displayNameFor(provider: LoginProvider, input: IdentityProfileInput): string {
  const name = input.displayName?.trim();
  if (name) return name;
  return provider === 'line' ? 'LINE 苔友' : provider === 'google' ? 'Google 苔友' : '苔友';
}

async function upsertLineUser(tx: any, profileId: string, subject: string, name: string): Promise<void> {
  await tx`
    insert into public.line_users (line_sub, user_id, status, display_name, linked_at, last_seen_at)
    values (${subject}, ${profileId}, 'active', ${name}, now(), now())
    on conflict (line_sub) do update
      set user_id = excluded.user_id,
          status = 'active',
          display_name = excluded.display_name,
          last_seen_at = now()
  `;
}

async function createSession(
  tx: any,
  profileId: string,
  platform: AuthPlatform,
): Promise<{ sessionId: string; refreshToken: string; accessToken: string }> {
  const sessionId = crypto.randomUUID();
  const refreshToken = createRefreshToken();
  const refreshHash = await hashRefreshToken(refreshToken);
  const expiresAt = newSessionExpiry().toISOString();
  await tx`
    insert into public.auth_sessions (id, profile_id, refresh_token_hash, platform, expires_at)
    values (${sessionId}, ${profileId}, ${refreshHash}, ${platform}, ${expiresAt})
  `;
  const accessToken = await signAccessToken(profileId, sessionId);
  return { sessionId, refreshToken, accessToken };
}

export async function loginWithProvider(
  provider: LoginProvider,
  subject: string,
  input: IdentityProfileInput,
  platform: AuthPlatform,
): Promise<AuthLoginResult> {
  if (!subject.trim()) throw new AuthServiceError('VALIDATION_ERROR');
  if (platform !== 'ios' && platform !== 'liff') throw new AuthServiceError('VALIDATION_ERROR');

  return await sql.begin(async (tx: any) => {
    let profile: any;
    const [identity] = await tx`
      select profile_id from public.auth_identities
      where provider = ${provider} and subject = ${subject}
      for update
    `;

    if (identity) {
      const [existing] = await tx`
        select * from public.profiles where id = ${identity.profile_id} for update
      `;
      if (!existing || existing.status !== 'active') throw new AuthServiceError('UNAUTHENTICATED');
      profile = existing;
      await tx`
        update public.auth_identities set last_used_at = now()
        where provider = ${provider} and subject = ${subject}
      `;
      if (provider === 'line') {
        await upsertLineUser(tx, profile.id, subject, profile.display_name);
      }
    } else {
      if (provider === 'line') {
        const [legacy] = await tx`
          select * from public.profiles where line_sub = ${subject} limit 1
        `;
        if (legacy) {
          if (legacy.status !== 'active') throw new AuthServiceError('UNAUTHENTICATED');
          profile = legacy;
          await tx`
            insert into public.auth_identities (profile_id, provider, subject, last_used_at)
            values (${profile.id}, 'line', ${subject}, now())
            on conflict (provider, subject) do nothing
          `;
          await upsertLineUser(tx, profile.id, subject, profile.display_name);
        }
      }

      if (!profile) {
        const id = crypto.randomUUID();
        const displayName = displayNameFor(provider, input);
        const timezone = input.timezone ?? 'Asia/Taipei';
        const [created] = await tx`
          insert into public.profiles (id, line_sub, display_name, avatar_url, timezone)
          values (
            ${id},
            ${provider === 'line' ? subject : null},
            ${displayName},
            ${input.avatarUrl ?? null},
            ${timezone}
          )
          returning *
        `;
        profile = created;
        await tx`
          insert into public.auth_identities (profile_id, provider, subject, last_used_at)
          values (${profile.id}, ${provider}, ${subject}, now())
        `;
        if (provider === 'line') {
          await upsertLineUser(tx, profile.id, subject, profile.display_name);
        }
      }
    }

    const session = await createSession(tx, profile.id, platform);
    await tx`
      insert into public.audit_logs (actor_id, actor_type, action, target_type, target_id, source)
      values (${profile.id}, 'user', 'auth.login', 'profile', ${profile.id}, ${platform === 'ios' ? 'ios' : 'liff'})
    `;
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      userId: profile.id,
      profile: profileFromRow(profile),
    };
  });
}

export async function loginAsGuest(platform: AuthPlatform): Promise<AuthLoginResult> {
  return await loginWithProvider('guest', crypto.randomUUID(), { displayName: '苔友' }, platform);
}

export async function refreshSession(refreshToken: string): Promise<AuthLoginResult> {
  if (!refreshToken) throw new AuthServiceError('UNAUTHENTICATED');
  const hash = await hashRefreshToken(refreshToken);

  return await sql.begin(async (tx: any) => {
    const [session] = await tx`
      select s.*, p.status as profile_status, p.display_name, p.avatar_url, p.timezone, p.default_household_id
      from public.auth_sessions s
      join public.profiles p on p.id = s.profile_id
      where s.refresh_token_hash = ${hash}
      for update
    `;
    if (
      !session ||
      session.revoked_at !== null ||
      new Date(session.expires_at).getTime() <= Date.now() ||
      session.profile_status !== 'active'
    ) {
      throw new AuthServiceError('UNAUTHENTICATED');
    }

    const nextRefresh = createRefreshToken();
    const nextHash = await hashRefreshToken(nextRefresh);
    const expiresAt = newSessionExpiry().toISOString();
    await tx`
      update public.auth_sessions
      set refresh_token_hash = ${nextHash}, last_used_at = now(), expires_at = ${expiresAt}
      where id = ${session.id}
    `;
    const accessToken = await signAccessToken(session.profile_id, session.id);
    return {
      accessToken,
      refreshToken: nextRefresh,
      sessionId: session.id,
      userId: session.profile_id,
      profile: {
        id: session.profile_id,
        displayName: session.display_name,
        avatarUrl: session.avatar_url,
        timezone: session.timezone,
        defaultHouseholdId: session.default_household_id,
      },
    };
  });
}

export async function listIdentities(profileId: string): Promise<string[]> {
  const rows = await sql`
    select provider from public.auth_identities where profile_id = ${profileId} order by provider
  `;
  return rows.map((row: any) => row.provider as string);
}

export async function linkIdentity(
  profileId: string,
  provider: LinkProvider,
  subject: string,
): Promise<void> {
  if (!subject.trim() || (provider !== 'line' && provider !== 'google')) {
    throw new AuthServiceError('VALIDATION_ERROR');
  }
  await sql.begin(async (tx: any) => {
    const [profile] = await tx`
      select * from public.profiles where id = ${profileId} for update
    `;
    if (!profile || profile.status !== 'active') throw new AuthServiceError('UNAUTHENTICATED');

    const [existing] = await tx`
      select profile_id from public.auth_identities
      where provider = ${provider} and subject = ${subject}
      for update
    `;
    if (existing) {
      if (existing.profile_id !== profileId) throw new AuthServiceError('IDENTITY_ALREADY_LINKED');
      await tx`
        update public.auth_identities set last_used_at = now()
        where provider = ${provider} and subject = ${subject}
      `;
      return;
    }

    if (provider === 'line') {
      const [other] = await tx`
        select id from public.profiles where line_sub = ${subject} and id <> ${profileId} limit 1
      `;
      if (other) throw new AuthServiceError('IDENTITY_ALREADY_LINKED');
      await tx`update public.profiles set line_sub = ${subject}, updated_at = now() where id = ${profileId}`;
    }

    await tx`
      insert into public.auth_identities (profile_id, provider, subject, last_used_at)
      values (${profileId}, ${provider}, ${subject}, now())
    `;
    if (provider === 'line') {
      await upsertLineUser(tx, profileId, subject, profile.display_name);
    }
    await tx`
      insert into public.audit_logs (actor_id, actor_type, action, target_type, target_id, source)
      values (${profileId}, 'user', 'auth.link', 'identity', ${provider}, 'ios')
    `;
  });
}

export async function unlinkIdentity(profileId: string, provider: LinkProvider): Promise<void> {
  if (provider !== 'line' && provider !== 'google') throw new AuthServiceError('VALIDATION_ERROR');
  await sql.begin(async (tx: any) => {
    const identities = await tx`
      select provider, subject from public.auth_identities where profile_id = ${profileId} for update
    `;
    if (identities.length <= 1) throw new AuthServiceError('LAST_IDENTITY');
    if (!identities.some((row: any) => row.provider === provider)) {
      throw new AuthServiceError('NOT_FOUND');
    }

    await tx`
      delete from public.auth_identities where profile_id = ${profileId} and provider = ${provider}
    `;
    if (provider === 'line') {
      await tx`update public.profiles set line_sub = null, updated_at = now() where id = ${profileId}`;
      await tx`update public.line_users set status = 'unlinked' where user_id = ${profileId}`;
    }
    await tx`
      insert into public.audit_logs (actor_id, actor_type, action, target_type, target_id, source)
      values (${profileId}, 'user', 'auth.unlink', 'identity', ${provider}, 'ios')
    `;
  });
}

export async function logout(profileId: string, sessionId: string): Promise<void> {
  await sql`
    update public.auth_sessions
    set revoked_at = now()
    where id = ${sessionId} and profile_id = ${profileId} and revoked_at is null
  `;
}

export async function deleteAccount(profileId: string): Promise<void> {
  await sql.begin(async (tx: any) => {
    const [profile] = await tx`
      select * from public.profiles where id = ${profileId} for update
    `;
    if (!profile) throw new AuthServiceError('NOT_FOUND');
    if (profile.status === 'deleted') return;

    const owned = await tx`
      select id from public.households
      where owner_id = ${profileId} and deleted_at is null
      for update
    `;
    for (const household of owned) {
      const [count] = await tx`
        select count(*)::int as count from public.household_members where household_id = ${household.id}
      `;
      if (count.count > 1) throw new AuthServiceError('LAST_OWNER');
    }

    for (const household of owned) {
      await tx`delete from public.households where id = ${household.id}`;
    }
    await tx`delete from public.household_members where user_id = ${profileId}`;
    await tx`
      update public.profiles
      set status = 'deleted', deleted_at = now(), line_sub = null,
          default_household_id = null, updated_at = now()
      where id = ${profileId}
    `;
    await tx`update public.auth_sessions set revoked_at = now() where profile_id = ${profileId}`;
    await tx`update public.line_users set status = 'deleted' where user_id = ${profileId}`;
    await tx`delete from public.auth_identities where profile_id = ${profileId}`;
    await tx`
      insert into public.audit_logs (actor_id, actor_type, action, target_type, target_id, source)
      values (${profileId}, 'user', 'auth.delete', 'profile', ${profileId}, 'ios')
    `;
  });
}
