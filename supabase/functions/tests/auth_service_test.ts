import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

Deno.env.set('SUPABASE_DB_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
Deno.env.set('JWT_SECRET', 'test-secret-at-least-32-characters-long');

const auth = await import('../_shared/auth_service.ts');
const { sql } = await import('../_shared/db.ts');

function subject(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function cleanup(profileIds: string[]): Promise<void> {
  if (!profileIds.length) return;
  await sql`delete from public.profiles where id in ${sql(profileIds)}`;
}

Deno.test('provider login is idempotent for the same identity', async () => {
  const lineSubject = subject('line');
  const first = await auth.loginWithProvider('line', lineSubject, { displayName: 'LINE User' }, 'ios');
  const second = await auth.loginWithProvider('line', lineSubject, { displayName: 'LINE User' }, 'liff');

  try {
    assertEquals(second.userId, first.userId);
    assertEquals(second.profile.displayName, 'LINE User');
    assert(second.accessToken.length > 0);
    assert(second.refreshToken.length > 0);
    const [identity] = await sql`
      select profile_id from public.auth_identities
      where provider = 'line' and subject = ${lineSubject}
    `;
    assertEquals(identity.profile_id, first.userId);
  } finally {
    await cleanup([first.userId]);
  }
});

  Deno.test('refresh rotation rejects the old token and revokes the session', async () => {
  const login = await auth.loginWithProvider('line', subject('line'), { displayName: 'Rotate' }, 'ios');
  try {
    const rotated = await auth.refreshSession(login.refreshToken);
    assert(rotated.accessToken.length > 0);
    assert(rotated.refreshToken !== login.refreshToken);
    await assertRejects(
      () => auth.refreshSession(login.refreshToken),
      auth.AuthServiceError,
      'UNAUTHENTICATED',
    );
    const [session] = await sql`
      select revoked_at from public.auth_sessions where id = ${login.sessionId}
    `;
    assert(session.revoked_at !== null);
  } finally {
    await cleanup([login.userId]);
  }
});

Deno.test('duplicate identity link is rejected without moving data', async () => {
  const line = await auth.loginWithProvider('line', subject('line'), { displayName: 'Owner A' }, 'ios');
  const googleSubject = subject('google');
  const google = await auth.loginWithProvider('google', googleSubject, { displayName: 'Owner B' }, 'ios');
  try {
    await assertRejects(
      () => auth.linkIdentity(line.userId, 'google', googleSubject),
      auth.AuthServiceError,
      'IDENTITY_ALREADY_LINKED',
    );
    const [identity] = await sql`
      select profile_id from public.auth_identities
      where provider = 'google' and subject = ${googleSubject}
    `;
    assertEquals(identity.profile_id, google.userId);
  } finally {
    await cleanup([line.userId, google.userId]);
  }
});

Deno.test('last identity cannot be unlinked', async () => {
  const login = await auth.loginWithProvider('line', subject('line'), { displayName: 'Only' }, 'ios');
  try {
    await assertRejects(
      () => auth.unlinkIdentity(login.userId, 'line'),
      auth.AuthServiceError,
      'LAST_IDENTITY',
    );
  } finally {
    await cleanup([login.userId]);
  }
});

Deno.test('guest cannot unlink its last recoverable non-guest identity', async () => {
  const guest = await auth.loginAsGuest('ios');
  try {
    await auth.linkIdentity(guest.userId, 'line', subject('line'));
    await assertRejects(
      () => auth.unlinkIdentity(guest.userId, 'line'),
      auth.AuthServiceError,
      'LAST_IDENTITY',
    );
  } finally {
    await cleanup([guest.userId]);
  }
});

Deno.test('a profile cannot link two identities for the same provider', async () => {
  const guest = await auth.loginAsGuest('ios');
  try {
    await auth.linkIdentity(guest.userId, 'line', subject('line'));
    await assertRejects(
      () => auth.linkIdentity(guest.userId, 'line', subject('line')),
      auth.AuthServiceError,
      'PROVIDER_ALREADY_LINKED',
    );
  } finally {
    await cleanup([guest.userId]);
  }
});

Deno.test('former owner deletion does not delete a household with another owner', async () => {
  const a = await auth.loginAsGuest('ios');
  const b = await auth.loginAsGuest('ios');
  const householdId = crypto.randomUUID();
  try {
    await sql`
      insert into public.households (id, name, owner_id, timezone)
      values (${householdId}, 'Owner transition', ${a.userId}, 'Asia/Taipei')
    `;
    await sql`
      insert into public.household_members (household_id, user_id, role)
      values (${householdId}, ${a.userId}, 'owner'),
             (${householdId}, ${b.userId}, 'owner')
    `;
    await auth.deleteAccount(a.userId);
    const [household] = await sql`select owner_id from public.households where id = ${householdId}`;
    assert(household);
    assertEquals(household.owner_id, b.userId);

    await auth.deleteAccount(b.userId);
    const [gone] = await sql`select id from public.households where id = ${householdId}`;
    assertEquals(gone, undefined);
  } finally {
    await sql`delete from public.households where id = ${householdId}`;
    await cleanup([a.userId, b.userId]);
  }
});

Deno.test('account deletion blocks a sole owner with another member', async () => {
  const owner = await auth.loginWithProvider('guest', crypto.randomUUID(), { displayName: 'Owner' }, 'ios');
  const caretaker = await auth.loginWithProvider('guest', crypto.randomUUID(), { displayName: 'Caretaker' }, 'ios');
  const householdId = crypto.randomUUID();
  try {
    await sql`
      insert into public.households (id, name, owner_id, timezone)
      values (${householdId}, 'Delete test', ${owner.userId}, 'Asia/Taipei')
    `;
    await sql`
      insert into public.household_members (household_id, user_id, role)
      values (${householdId}, ${owner.userId}, 'owner'),
             (${householdId}, ${caretaker.userId}, 'caretaker')
    `;
    await sql`
      update public.profiles set default_household_id = ${householdId}
      where id in (${owner.userId}, ${caretaker.userId})
    `;

    await assertRejects(
      () => auth.deleteAccount(owner.userId),
      auth.AuthServiceError,
      'LAST_OWNER',
    );
    const [profile] = await sql`select status from public.profiles where id = ${owner.userId}`;
    assertEquals(profile.status, 'active');
  } finally {
    await sql`delete from public.households where id = ${householdId}`;
    await cleanup([owner.userId, caretaker.userId]);
  }
});
