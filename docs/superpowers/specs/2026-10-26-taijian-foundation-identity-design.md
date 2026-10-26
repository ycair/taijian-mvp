# Foundation & Identity Design

**Status:** Draft for review  
**Date:** 2026-10-26  
**Program:** iOS full feature parity; LIFF/Bot core  
**Supersedes:** the LINE-only custom JWT demo path in `docs/operations/supabase-cloud.md`

## 1. Goal

Make identity, sessions, household membership, and account lifecycle solid enough
for a full iOS product while keeping the existing LIFF and Bot core working.

This is the first sub-project of the feature-parity program. It does not implement
journal, map, proposals, shop, subscription, or points.

## 2. Decisions

- iOS supports **LINE, Google, and guest** sign-in. Apple sign-in is deferred.
- An external identity that already belongs to another profile is **rejected**,
  never auto-merged. The user must sign into the original account first.
- The existing custom-JWT + Postgres RLS model stays. Supabase Auth is not the
  canonical user store because LINE is a first-class provider and the app already
  depends on `profiles.id = JWT sub`.
- Access tokens are short-lived; refresh tokens are opaque, hashed, rotating, and
  revocable.
- UI continues the original 苔間 warm hand-drawn direction. No original pixel art,
  sprites, screenshots, copy, or branding is copied.
- Commerce/subscription are sandbox/manual for the demo; not in this spec.
- Apple sign-in, TestFlight, App Store distribution, APNs remote push, and real
  StoreKit/IAP are deferred until a paid Apple Developer Program membership exists.
  Current iOS work is local Profile installation only.

## 3. Non-goals

- Merging two existing profiles or two households automatically.
- Admin console for account moderation.
- Apple sign-in, TestFlight, App Store distribution, APNs remote push.
- Real StoreKit/IAP and App Store subscription verification.
- Widgets, Share Extension.
- Journal/media, map, proposals, shop, points, subscriptions.
- Android.

## 4. Identity model

### 4.1 Canonical identity

`profiles.id` remains the canonical user ID used in JWTs and RLS.

A profile has one or more identities in `auth_identities`:

```sql
create table auth_identities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('line','apple','google','guest')),
  -- apple is reserved for future re-enablement; no Apple flow is exposed now.
  subject text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (provider, subject)
);
create index auth_identities_profile_idx on auth_identities(profile_id);
```

- `subject` is the provider's stable subject: LINE `sub`, Google `sub`, or a
  server-generated guest UUID. Apple is reserved for future re-enablement.
- `profiles.line_sub` and `line_users` stay during migration for Bot compatibility.
  New code treats `auth_identities` as the source of truth.

### 4.2 Profile status

Add:

```sql
alter table profiles
  add column status text not null default 'active'
  check (status in ('active','disabled','deleted'));
```

`disabled` and `deleted` profiles cannot create new sessions; existing sessions
are revoked. Soft delete keeps audit/history until the purge job removes data.

### 4.3 Sessions

```sql
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
```

- Access JWT: `sub = profile.id`, `sid = session.id`, `role = authenticated`,
  `aud = authenticated`, `exp = 1 hour`.
- Refresh token: 32 random bytes, base64url, stored only as SHA-256 hash.
- Refresh lifetime: 30 days; rotation on every refresh; old token revoked.
- Client stores refresh token in iOS Keychain / LIFF `localStorage`.
- `sid` lets trusted server commands reject revoked/disabled sessions.
- On logout, the server revokes the session; the client clears storage either way.

### 4.4 Account linking rules

- A provider identity can belong to exactly one profile.
- `/auth/link` with an identity already linked to another profile returns
  `IDENTITY_ALREADY_LINKED`; no data is moved.
- Cannot unlink the last usable login method.
- A guest can link LINE or Google and keep the same profile.
- A user can link multiple identities to one profile; deleting one identity does
  not delete the profile unless it is the last identity and deletion is requested.
- Signing in with any linked identity returns the same `profile.id`.

## 5. Auth Edge Functions

Create one `auth` Edge Function with `action` to keep rate limiting and shared
token verification together. Keep `line-login` as a compatibility wrapper for one
release; it delegates to `auth` with `action=line`.

### Required Edge Function configuration

| Name | Purpose |
|---|---|
| `JWT_SECRET` | HS256 signing/verification for access JWTs |
| `LINE_LOGIN_CHANNEL_ID` | LINE ID-token audience |
| `GOOGLE_IOS_CLIENT_ID` | Google ID-token audience |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | server-side user/session writes |
| `SUPABASE_DB_URL` | transactions for sessions/identities |

No provider client secret is needed for ID-token verification except where a
provider requires it; LINE ID-token verification uses the public channel ID.

### Actions

| Action | Input | Output |
|---|---|---|
| `line` | `idToken`, `platform` | access/refresh tokens + profile |
| `google` | `idToken`, `platform` | access/refresh tokens + profile |
| `guest` | `platform` | access/refresh tokens + new guest profile |
| `refresh` | `refreshToken` | rotated access/refresh tokens |
| `link` | access JWT + provider token | linked identity |
| `unlink` | access JWT + provider | unlinked |
| `logout` | access JWT | session revoked |
| `delete` | access JWT + confirmation | profile deleted / owners transferred |

### Provider verification

- **LINE:** `POST https://api.line.me/oauth2/v2.1/verify` with
  `LINE_LOGIN_CHANNEL_ID`; check `aud`, `sub`, `exp`.
- **Google:** verify against Google JWKS; check `aud` equals the configured iOS
  OAuth client ID and `exp`.
- **Guest:** server creates a profile + `guest` identity and a session.
- All provider verification failures return a generic `UNAUTHENTICATED`; never
  leak token contents.

### Session rules

- Access JWT lifetime 1 hour.
- Refresh token lifetime 30 days; rotate on use.
- A session row is checked when refreshing and for sensitive commands.
- Disabled/deleted profiles invalidate sessions immediately on the next refresh
  and on server-side sensitive operations.
- Rate limits: per IP and per identity; guest creation is rate-limited more
  aggressively.

## 6. Household and invites

Keep the existing household model:

- `households`, `household_members`, `invites`, `audit_logs`.
- Roles: `owner`, `caretaker`.
- A user can belong to multiple households; `profiles.default_household_id` selects
  the default.

Extend `invites` for both link and UID invites:

```sql
alter table invites
  add column invite_type text not null default 'link'
    check (invite_type in ('link','uid')),
  add column invited_user_id uuid references profiles(id),
  add column invited_label text;
```

Rules:

- `link` invite: token can be accepted once by any signed-in user.
- `uid` invite: token is bound to `invited_user_id`; another user gets
  `FORBIDDEN`.
- Owner can revoke; expired/used/revoked invites cannot be accepted.
- Last owner cannot leave/be removed until another owner exists.
- Household deletion/account deletion must not orphan members or animals; the
  server returns `LAST_OWNER` or requires an explicit transfer.
- Account deletion is blocked while the user is the sole owner of a household
  that still has other members. The user must transfer ownership or remove the
  household first. If they are the only member, owned data is deleted/cascaded.

## 7. Client changes

### iOS

- `AuthService` gains `signInAsGuest`, `linkProvider`, `unlinkProvider`,
  `deleteAccount`, and `refreshSession`.
- Provider adapters:
  - LINE: existing `flutter_line_sdk`.
  - Google: existing `google_sign_in`.
- `SupabaseAuthService`:
  - stores access + refresh tokens in Keychain;
  - refreshes proactively before expiry and on 401;
  - retries one request after a successful refresh;
  - clears the session and returns to sign-in on refresh failure;
  - exposes linked identities for Settings.
- Sign-in screen: four options; guest option carries a data-loss warning.
- Settings: linked accounts, link/unlink, delete account.
- Existing `line-login` clients can stay on the compatibility endpoint until LIFF
  is migrated to `auth`.

### LIFF

- Replace direct `line-login` calls with `auth` `line` action.
- Store access + refresh tokens in `localStorage`.
- Refresh on 401; clear and re-login if refresh fails.
- Keep the current LIFF core screens; no guest.

### Bot

- `line_users` continues to map `line_sub` to `profile_id`.
- `auth` keeps that mapping updated when a LINE identity is created/linked.
- Bot does not issue sessions; it uses service-role command execution.

## 8. Security and RLS

- `auth_identities` and `auth_sessions`: RLS enabled, no client policies; service
  role only.
- `profiles`: self + household-member read only; writes through `execute-command`
  or auth functions.
- All writes remain server-authoritative; clients never write auth tables.
- Refresh token hashes only; no plaintext tokens at rest.
- Audit auth events: sign-in, link, unlink, refresh failure, delete, revoke.
- Do not log tokens, ID tokens, nonces, or full provider responses.
- Use constant-time comparison for refresh hashes where applicable.
- Rate-limit auth endpoints; return generic errors for unknown identities.
- Account deletion revokes all sessions and schedules data purge.
- Google audience must be the iOS OAuth client ID, not a web client.

## 9. Migration

1. Add auth tables and profile status.
2. Backfill `auth_identities` from existing `profiles.line_sub`.
3. Keep `line-login` working during the transition.
4. New clients use `auth`; old clients continue until their access token expires.
5. After all clients migrate, `line-login` can be reduced to a wrapper or removed.
6. Existing demo profiles/households remain; no destructive reset required.

## 10. Testing

### Edge/DB integration

- Each provider creates a session and returns the same profile on repeat sign-in.
- Duplicate identity link returns `IDENTITY_ALREADY_LINKED` without moving data.
- Guest → LINE/Google link works.
- Last identity cannot be unlinked.
- Refresh rotates and rejects the old refresh token.
- Revoked/disabled session cannot refresh or execute sensitive commands.
- UID invite rejects the wrong user; link invite remains single-use.
- Last owner cannot leave.
- Account deletion handles owned households safely.
- RLS: anon/authenticated cannot read `auth_sessions`/`auth_identities`.

### Dart

- Provider adapter success/cancel/error mapping.
- Token refresh on 401; no infinite retry loop.
- Link/unlink/delete UI states.
- Guest warning and sign-out behavior.

### Device

- LINE, Google, guest on personal team.
- Apple sign-in is out of scope; do not add its capability or test path.
- Verify token refresh by shortening access lifetime in a test build.
- Verify LIFF compatibility with existing user.

## 11. Acceptance criteria

- LINE, Google, and guest login options are present; Apple is not exposed.
- A user signing in with any linked provider lands on the same profile, household,
  and animals.
- Signing in with a provider already linked to another profile is rejected with a
  clear message and no data change.
- Access token expiry does not strand the user; refresh works silently.
- Guest users can bind an account before losing access.
- Owner/caretaker and invite rules are enforced server-side.
- Account deletion and session revocation are auditable.
- Existing LIFF LINE users continue to see the same data.

## 12. Risks / open items

- **Apple/App Store:** deferred; no paid-team dependency for the current scope.
- **Google client configuration:** need a real iOS OAuth client ID and URL scheme;
  the current Info.plist has a placeholder.
- **Refresh token security:** custom auth is sensitive; the implementation must not
  log or store plaintext refresh tokens.
- **Account linking UX:** rejecting duplicate identities is deliberate; later we
  can design an explicit data-merge flow as a separate spec.
- **LIFF localStorage:** XSS would expose refresh tokens; keep the LIFF surface
  minimal and revisit a BFF/secure cookie if needed.
- **Remote push/TestFlight/App Store:** deferred. Local notifications only; iOS
  installs are local Profile builds. Real StoreKit/IAP is deferred too.

## 13. Program roadmap

1. **Foundation & identity** (this spec)
2. Care core parity: residents depth, records/charts, reminders, notifications,
   Today widget
3. Journal & media, Share Extension
4. Habitat map
5. Community proposals
6. Shop, points, subscription (sandbox/manual)
7. Release polish
