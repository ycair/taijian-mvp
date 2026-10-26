# Foundation & Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LINE-only demo identity with a foundation for LINE, Google, and guest (Apple reserved for a future re-enable); add rotating refresh sessions, account linking, UID/link invites, and account deletion, without Apple or App Store dependencies.

**Architecture:** Keep the current custom-JWT + Postgres RLS model. `profiles.id` remains the canonical user ID. Add `auth_identities` and `auth_sessions`, with a single `auth` Edge Function for login/refresh/link/unlink/logout/delete and a compatibility `line-login` wrapper. Clients store short-lived access tokens plus rotating refresh tokens; `execute-command` checks active sessions for sensitive writes.

**Tech Stack:** Supabase Postgres/RLS, Deno Edge Functions, `jose`, `postgres`, Flutter 3.47, Dart 3.13, `flutter_line_sdk`, `google_sign_in`, `flutter_secure_storage`, React/Vite LIFF.

**Spec:** `docs/superpowers/specs/2026-10-26-taijian-foundation-identity-design.md`

## Global Constraints

- iOS providers: **LINE, Google, guest**. Apple is reserved in the schema but has no UI/flow.
- No TestFlight, App Store, APNs remote push, real StoreKit/IAP, or Apple Developer Program dependency.
- Current iOS delivery is local Profile install via `devicectl`.
- Duplicate provider identity is rejected; never auto-merge profiles.
- Access JWT: 1 hour; refresh token: 30 days, hashed, rotating, revocable.
- All auth/session tables are server-only; clients must not read them.
- Do not copy original app assets, copy, sprites, or branding.
- Existing LINE users/households must survive migration.
- Keep mock mode and existing Flutter tests working.

## Review Focus

- Refresh rotation: replaying an old refresh token must fail and revoke the session.
- Duplicate identity: linking an existing provider subject must return `IDENTITY_ALREADY_LINKED` with no data movement.
- Guest lifecycle: guest can bind a provider; losing the device without binding means unrecoverable data.
- Account deletion: sole owner of a shared household cannot delete without transfer.
- LIFF token storage: localStorage refresh token is XSS-sensitive; keep the LIFF surface minimal.
- Google audience: verify the **Web** OAuth client ID (`GOOGLE_SERVER_CLIENT_ID`), not the iOS client ID; iOS uses the Web ID as `GIDServerClientID`.

---

### Task 1: Schema migration and LINE backfill

**Files:**
- Create: `supabase/migrations/20261026120000_foundation_identity.sql`
- Test: `supabase/tests/foundation_identity.sql` (SQL assertions via `psql`)

**Interfaces:**
- Tables: `auth_identities`, `auth_sessions`.
- `profiles.status` values: `active`, `disabled`, `deleted`.
- `invites.invite_type`: `link`, `uid`; `invites.invited_user_id`.
- Backfill: one `('line', line_sub, profile_id)` identity per existing profile.

- [ ] Write a failing SQL assertion file that checks the new tables, constraints, `profiles.status`, invite columns, and backfilled LINE identities.
- [ ] Run `psql "$LOCAL_DB_URL" -f supabase/tests/foundation_identity.sql`; expect missing table/column failures.
- [ ] Add the migration with:

```sql
create table auth_identities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('line','apple','google','guest')),
  subject text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (provider, subject)
);
create index auth_identities_profile_idx on auth_identities(profile_id);

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  refresh_token_hash text not null unique,
  platform text not null check (platform in ('ios','liff')),
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index auth_sessions_profile_idx on auth_sessions(profile_id);

alter table profiles
  add column status text not null default 'active'
  check (status in ('active','disabled','deleted'));

alter table invites
  add column invite_type text not null default 'link'
    check (invite_type in ('link','uid')),
  add column invited_user_id uuid references profiles(id),
  add column invited_label text;

insert into auth_identities (profile_id, provider, subject)
select id, 'line', line_sub from profiles
where line_sub is not null
on conflict (provider, subject) do nothing;

alter table auth_identities enable row level security;
alter table auth_sessions enable row level security;
-- No client policies. service_role only.
grant select on auth_identities, auth_sessions to service_role;
```

- [ ] Apply locally with `pnpm exec supabase db reset`; run the SQL assertions; expect pass.
- [ ] Run `pnpm exec supabase db advisors` (or MCP `get_advisors`) and confirm only intentional INFO findings remain.
- [ ] Commit the migration and test.

### Task 2: Token/session helpers

**Files:**
- Create: `supabase/functions/_shared/auth_tokens.ts`
- Test: `supabase/functions/tests/auth_tokens_test.ts`
- Modify: `supabase/functions/_shared/jwt.ts`

**Interfaces:**
- `createRefreshToken(): string` (32 random bytes, base64url).
- `hashRefreshToken(token: string): Promise<string>` (SHA-256 hex).
- `signAccessToken(profileId: string, sessionId: string): Promise<string>` (1h, `sid` claim).
- Remove session-less token issuance from active code; update old callers/tests to include a session ID.
- `verifyAccessToken(request: Request): Promise<{ profileId: string; sessionId: string } | null>`.
- `newSessionExpiry(now?: Date): Date` (30 days).

- [ ] Write Deno tests for refresh length/entropy shape, stable SHA-256, JWT `sub`/`sid`/`exp`, and invalid/expired token rejection.
- [ ] Run `deno test --allow-env supabase/functions/tests/auth_tokens_test.ts`; expect failures.
- [ ] Implement helpers; remove session-less token issuance from active code and update old tests/callers to use `signAccessToken`.
- [ ] Run test; expect pass.
- [ ] Commit.

### Task 3: Provider verifiers

**Files:**
- Create: `supabase/functions/_shared/auth_providers.ts`
- Test: `supabase/functions/tests/auth_providers_test.ts`

**Interfaces:**
- `verifyLineToken(idToken, fetchImpl?) -> {subject, name, picture}`.
- `verifyGoogleToken(idToken, fetchImpl?) -> {subject, name, picture, email?}`.
- Shared `AuthProviderError(code)` with generic external messages.
- Apple is intentionally absent.

- [ ] Write tests for valid LINE/Google responses, wrong `aud`, expired token, and malformed provider response.
- [ ] Run tests; expect failures.
- [ ] Implement LINE via `POST https://api.line.me/oauth2/v2.1/verify` with `LINE_LOGIN_CHANNEL_ID`.
- [ ] Implement Google via `https://oauth2.googleapis.com/tokeninfo?id_token=...`; require `aud === GOOGLE_SERVER_CLIENT_ID`, `exp` in the future, and non-empty `sub`.
- [ ] Do not include token values in errors/logs.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 4: `auth` Edge Function

**Files:**
- Create: `supabase/functions/auth/index.ts`
- Create: `supabase/functions/_shared/auth_service.ts`
- Test: `supabase/functions/tests/auth_service_test.ts`
- Test: `supabase/functions/tests/auth_http_test.ts`
- Modify: `supabase/functions/line-login/index.ts` (delegate compatibility wrapper)

**Interfaces:**
- `POST /functions/v1/auth` body `{ action, ... }`.
- Actions: `line`, `google`, `guest`, `refresh`, `link`, `unlink`, `logout`, `delete`.
- Response: `{ ok, accessToken, refreshToken, sessionId, userId, profile }`.
- Errors: `UNAUTHENTICATED`, `IDENTITY_ALREADY_LINKED`, `LAST_IDENTITY`, `LAST_OWNER`, `RATE_LIMITED`, `VALIDATION_ERROR`, `FORBIDDEN`.

- [ ] Write failing service tests with a fake DB/verifiers:
  - LINE repeat login returns the same profile and a new session.
  - Google creates a profile and maps the identity.
  - Guest creates a profile with a random guest subject.
  - `refresh` rotates the refresh token and rejects the old one.
  - `link` rejects an identity already attached to another profile.
  - `unlink` rejects the last identity.
  - `logout` revokes the session.
  - `delete` blocks a sole owner with other members.
- [ ] Run tests; expect failures.
- [ ] Implement the service with transactions:
  - identity lookup by `(provider, subject)`;
  - profile creation + identity insert;
  - session insert with refresh hash;
  - refresh rotation and revocation;
  - link/unlink/last-identity checks;
  - delete/owner transfer rules;
  - audit rows (`audit_logs` with action `auth.*`).
- [ ] Add rate limits using `rate_limits` keyed by IP/provider/action; return `RATE_LIMITED`.
- [ ] Expose the HTTP handler with CORS and JSON validation.
- [ ] Make `line-login` call the same LINE login path and return `accessToken`, `refreshToken`, `sessionId`, plus legacy `token` alias for one release.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 5: Session-aware commands and UID invites

**Files:**
- Modify: `supabase/functions/execute-command/index.ts`
- Modify: `supabase/functions/_shared/jwt.ts` (use `sid`)
- Test: `supabase/functions/tests/execute_command_auth_test.ts`
- Test: `supabase/tests/invite_uid.sql`
- Modify: `supabase/functions/line-webhook/index.ts` only if line mapping needs changes.

**Interfaces:**
- `execute-command` rejects missing/revoked `sid` and non-active profile with `UNAUTHENTICATED`.
- `member.invite` payload gains `inviteType: 'link'|'uid'`, optional `invitedUserId`.
- `member.accept` rejects a UID invite when the caller is not `invited_user_id`.
- `member.remove/leave/updateRole` keep last-owner rule.

- [ ] Write failing tests for revoked session, disabled profile, UID invite wrong user, and last-owner removal.
- [ ] Run tests; expect failures.
- [ ] Add session/profile lookup inside the command transaction; do not trust JWT alone for sensitive writes.
- [ ] Extend invite creation/acceptance and membership commands.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 6: iOS auth service with refresh

**Files:**
- Modify: `apps/mobile/lib/data/supabase/line_sdk_adapter.dart`
- Create: `apps/mobile/lib/data/supabase/google_sdk_adapter.dart`
- Create: `apps/mobile/lib/data/supabase/auth_models.dart`
- Modify: `apps/mobile/lib/data/supabase/secure_token_store.dart`
- Modify: `apps/mobile/lib/data/supabase/supabase_rest_client.dart`
- Modify: `apps/mobile/lib/features/auth/supabase_auth_service.dart`
- Modify: `apps/mobile/lib/features/auth/auth_service.dart`
- Test: `apps/mobile/test/data/supabase_rest_client_refresh_test.dart`
- Test: `apps/mobile/test/features/supabase_auth_service_test.dart`

**Interfaces:**
- `AuthSession { accessToken, refreshToken, sessionId, userId }`.
- `TokenStore` reads/writes access and refresh tokens.
- `SupabaseAuthService.signInWithLine()`, `signInWithGoogle()`, `signInAsGuest()`, `linkProvider()`, `unlinkProvider()`, `deleteAccount()`, `refreshSession()`.
- `SupabaseRestClient` retries one 401 after `onUnauthorized()` returns a new token.
- Apple methods throw `AuthException('此版本不支援 Apple 登入', code: 'UNSUPPORTED')`.

- [ ] Write failing tests for:
  - LINE/Google/guest sessions store both tokens;
  - 401 triggers exactly one refresh and retry;
  - failed refresh clears auth and does not loop;
  - duplicate identity error surfaces as AuthException.
- [ ] Run tests; expect failures.
- [ ] Implement token store and auth service changes.
- [ ] Initialize `google_sign_in` with the iOS client ID and Web `serverClientId`, obtain an ID token, and send it to `auth` action `google`.
- [ ] Guest sign-in calls `auth` action `guest`; no native SDK.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 7: iOS UI, Google config, remove Apple scope

**Files:**
- Modify: `apps/mobile/lib/features/auth/sign_in_screen.dart`
- Modify: `apps/mobile/lib/features/settings/settings_screen.dart`
- Modify: `apps/mobile/ios/Runner/Info.plist`
- Modify: `apps/mobile/ios/Runner/Runner.entitlements`
- Modify: `apps/mobile/pubspec.yaml`
- Test: `apps/mobile/test/widget/supabase_sign_in_test.dart`
- Test: `apps/mobile/test/widget/account_linking_test.dart`

**Interfaces:**
- Sign-in options: LINE, Google, guest.
- Guest banner: `訪客資料只存在這台裝置；請先綁定帳號再換手機`.
- Settings: linked identity list, link/unlink, delete account.
- No Apple button, Apple dependency, or Apple entitlement in the active Supabase path.

- [ ] Write failing widget tests for the three options, guest warning, linked identity display, and delete confirmation.
- [ ] Implement UI using the existing Direction B tokens; no pixel-art assets.
- [ ] Add the iOS client ID as `GIDClientID` and the Web client ID as `GIDServerClientID`/Edge `GOOGLE_SERVER_CLIENT_ID`; replace the placeholder URL scheme with the reversed iOS client ID. If the IDs are not available, Google remains visibly disabled with a config message; LINE/guest still test.
- [ ] Remove the Apple button/flow from the Supabase path and remove the Apple entitlement from `Runner.entitlements`. Keep the Firebase legacy code compiling only if it does not require the entitlement; if `sign_in_with_apple` becomes unused, remove the dependency and dead code in a separate cleanup commit.
- [ ] Run `flutter analyze` and widget tests; expect pass.
- [ ] Commit.

### Task 8: LIFF refresh and compatibility

**Files:**
- Modify: `apps/liff-sb/src/lib/api.ts`
- Modify: `apps/liff-sb/src/lib/supabase.ts`
- Modify: `apps/liff-sb/src/lib/liff.ts`
- Modify: `apps/liff-sb/src/App.tsx`
- Test: `apps/liff-sb/src/lib/auth.test.ts`

**Interfaces:**
- `loginWithLine` stores `accessToken` + `refreshToken` in localStorage.
- `authorizedFetch` refreshes once on 401 and retries.
- `makeClient(token)` cache is keyed by token.
- LIFF stays LINE-only; no guest/Google UI.

- [ ] Write failing tests for token storage, refresh-on-401, single retry, and logout clearing both tokens.
- [ ] Run `pnpm --filter @taijian/liff-sb test`; expect failures.
- [ ] Implement the auth API and token refresh.
- [ ] Update `App.tsx` auth state to use the new tokens.
- [ ] Keep the `line-login` compatibility response working for old builds.
- [ ] Run tests/build; expect pass.
- [ ] Commit.

### Task 9: Local integration, migration, and device verification

**Files:**
- Modify: `docs/operations/supabase-cloud.md` (new auth secrets/actions)
- Modify: `docs/operations/ios-native-line.md` (no Apple/App Store scope)
**Steps:**
- [ ] Start local Supabase and functions; apply migration; set local auth secrets.
- [ ] Verify guest login and refresh with explicit curl calls:

```bash
GUEST=$(curl -s -X POST "$FUNCTIONS_URL/auth" -H 'content-type: application/json' -d '{"action":"guest","platform":"ios"}')
ACCESS=$(echo "$GUEST" | jq -r .accessToken)
REFRESH=$(echo "$GUEST" | jq -r .refreshToken)
curl -s -X POST "$FUNCTIONS_URL/auth" -H 'content-type: application/json' \
  -d "{\"action\":\"refresh\",\"refreshToken\":\"$REFRESH\"}"
```

- [ ] Use the same pattern for LINE/Google provider tokens, link/unlink/logout/delete, and UID invite checks.
- [ ] Verify existing LIFF user still sees the same household after migration.
- [ ] Build iOS Profile with:
  `USE_MOCK=false USE_SUPABASE=true SUPABASE_URL=... SUPABASE_ANON_KEY=... LINE_CHANNEL_ID=2012198098`.
- [ ] Install on physical iPhone via `devicectl`; test LINE, guest, refresh, link Google when client ID exists.
- [ ] Run `flutter analyze`, `flutter test`, `pnpm --filter @taijian/liff-sb test`, and `deno test`.
- [ ] Commit docs and smoke script.

### Task 10: Cloud deployment and verification

- [ ] Apply the migration to `bqezqvhdmqanxgzfvdag`; preserve existing LINE profile/household data.
- [ ] Deploy `auth` and updated `line-login`; set `GOOGLE_SERVER_CLIENT_ID` (Web OAuth client), `JWT_SECRET`, and existing Supabase secrets. Do not set Apple/APNs secrets.
- [ ] Run security/performance advisors; fix regressions.
- [ ] Verify cloud LINE and guest login; Google after client ID; no App Store/APNs work.
- [ ] Open a PR; CI must be green; request a whole-branch review.

## Out of scope / deferred

- Apple sign-in, TestFlight, App Store, APNs remote push, real StoreKit/IAP.
- Account merge between two existing profiles.
- Journal/media, map, proposals, shop, points, subscriptions.
- Admin console.

## Execution recommendation

Use **native execution** (implement tasks in this session), because the auth contract is shared by iOS, LIFF, and Edge Functions; splitting it across independent agents risks incompatible token/session semantics. Add one fresh whole-branch reviewer at the end.
