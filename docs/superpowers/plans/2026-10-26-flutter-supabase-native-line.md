# Flutter Supabase + Native LINE SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Flutter iOS client against the existing Supabase backend, authenticating with the native LINE SDK and the existing `line-login` Edge Function.

**Architecture:** Keep the existing `AuthService`, `ReadStore`, and `CommandApi` interfaces. Add a Supabase REST implementation with token injection, a native LINE SDK adapter, and a secure token store. Reads poll PostgREST; writes use the existing `execute-command` Edge Function. Firebase stays as a legacy fallback; mock remains the default in debug.

**Tech Stack:** Flutter 3.47, Dart 3.13, `flutter_line_sdk` 3.0, `http`, `flutter_secure_storage`, Riverpod, Drift outbox.

**Spec:** `docs/superpowers/specs/2026-10-23-taijian-mvp-design.md`

## Global Constraints

- iOS deployment target 15.0 (already set).
- Bundle ID: `app.taijian.mobile`.
- LINE Login Channel ID: `2012198098`.
- Supabase URL: `https://bqezqvhdmqanxgzfvdag.supabase.co`.
- Public publishable key: `sb_publishable_JokBny3AnM8sCs75W3RsCA_TBN24fWl`.
- Never embed the Supabase secret key or `JWT_SECRET` in the app.
- No simulator runs; verify on the paired physical iPhone `C9E80CA3-1F63-5044-8D34-74D0C5564008`.
- Keep mock mode working for tests and demo.

## Review Focus

- Token expiry: custom JWT is short-lived; an expired token must clear auth instead of showing stale/empty data.
- Wrong LINE channel/bundle: login must surface an actionable error, not fail silently.
- PostgREST field naming: snake_case must map correctly to existing camelCase models.
- Outbox replay after login: queued commands must carry the new token and remain idempotent.
- iOS return URL: LINE must return to `line3rdp.app.taijian.mobile`; missing URL scheme leaves the app stuck after login.

---

### Task 1: Config + dependencies

**Files:**
- Modify: `apps/mobile/pubspec.yaml`
- Modify: `apps/mobile/lib/core/config/app_config.dart`
- Test: `apps/mobile/test/core/app_config_test.dart`

**Interfaces:**
- `AppConfig` gains optional `useSupabase`, `supabaseUrl`, `supabaseAnonKey`, `lineChannelId`.
- Existing constructors in tests remain source-compatible via defaults.

- [ ] Write a failing test asserting `AppConfig.fromEnvironment` defaults to mock in debug and exposes `supabaseConfigured` only when URL/key/channel are non-empty.
- [ ] Run `flutter test test/core/app_config_test.dart`; expect failure.
- [ ] Add `useSupabase`, `supabaseUrl`, `supabaseAnonKey`, `lineChannelId`; read `USE_SUPABASE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LINE_CHANNEL_ID`.
- [ ] Add `flutter_line_sdk: ^3.0.0`, `http: ^1.5.0`, `flutter_secure_storage: ^9.2.4`.
- [ ] Run test; expect pass.

### Task 2: REST client and mappers

**Files:**
- Create: `apps/mobile/lib/data/supabase/supabase_rest_client.dart`
- Create: `apps/mobile/lib/data/supabase/supabase_mappers.dart`
- Test: `apps/mobile/test/data/supabase_rest_client_test.dart`
- Test: `apps/mobile/test/data/supabase_mappers_test.dart`

**Interfaces:**
- `SupabaseRestClient(baseUrl, apiKey, tokenProvider, httpClient)`.
- `Future<List<Map<String, dynamic>>> select(String table, {String? query})`.
- `Future<Map<String, dynamic>> callFunction(String name, Map<String, dynamic> body, {bool authenticated = true})`.
- `Map<String, dynamic> snakeToCamelMap(Map<String, dynamic> input)`.
- `AppUser appUserFromSupabase(Map profile, List<Map> memberships)`.
- `Household householdFromSupabase(Map row)`.
- `HouseholdMember memberFromSupabase(Map row)`.
- `Animal animalFromSupabase(Map row)`.
- `CareRecord recordFromSupabase(Map row)`.
- `Reminder reminderFromSupabase(Map row)`.
- `Completion completionFromSupabase(Map row)`.

- [ ] Write failing tests with `MockClient` for headers (`apikey`, bearer token), query URL, JSON array parsing, and PostgREST error mapping.
- [ ] Write failing mapper tests using real Supabase snake_case payloads (household `owner_id`, reminder `next_due_at`, record `occurred_at`).
- [ ] Implement minimal client/mappers.
- [ ] Run both test files; expect pass.

### Task 3: ReadStore

**Files:**
- Create: `apps/mobile/lib/data/supabase/supabase_read_store.dart`
- Test: `apps/mobile/test/data/supabase_read_store_test.dart`

**Interfaces:**
- `SupabaseReadStore(SupabaseRestClient client, {Duration pollInterval})` implements `ReadStore`.
- Polls every 12 seconds and emits immediately.

- [ ] Write failing tests using a fake `SupabaseRestClient` (or `MockClient`) for profile + memberships, animals, records, reminders, and completion date filters.
- [ ] Implement queries and mapping for all six `ReadStore` methods.
- [ ] Run test; expect pass.

### Task 4: Command API

**Files:**
- Create: `apps/mobile/lib/data/supabase/supabase_command_api.dart`
- Test: `apps/mobile/test/data/supabase_command_api_test.dart`

**Interfaces:**
- `SupabaseCommandApi(client, appVersion)` implements `CommandApi`.
- Sends `commandId`, `type`, `householdId`, `baseRevision`, `payload`, `client.platform='ios'`.
- Maps response with `CommandResult.fromMap`.

- [ ] Write failing tests for success, business failure (`ok:false`), and HTTP 401/500 mapping to `CommandApiException`.
- [ ] Implement.
- [ ] Run test; expect pass.

### Task 5: Native LINE auth

**Files:**
- Create: `apps/mobile/lib/data/supabase/line_sdk_adapter.dart`
- Create: `apps/mobile/lib/data/supabase/secure_token_store.dart`
- Create: `apps/mobile/lib/features/auth/supabase_auth_service.dart`
- Modify: `apps/mobile/lib/features/auth/auth_service.dart`
- Modify: `apps/mobile/lib/data/mock/mock_auth_service.dart`
- Test: `apps/mobile/test/features/supabase_auth_service_test.dart`

**Interfaces:**
- `AbstractLineSdk { setup(channelId); login(); logout(); }`.
- `LineSession { idToken, userId, displayName, pictureUrl }`.
- `TokenStore { readToken(), readUserId(), save(), clear() }`.
- `AuthService` gains `Future<AppUser> signInWithLine()` with a default unsupported implementation.
- `SupabaseAuthService.signInWithLine()`: native login → `POST /functions/v1/line-login` → store token → emit `AppUser`.
- `initialize()` validates a stored token against `/rest/v1/profiles`; clear on 401.

- [ ] Write failing tests with fake LINE SDK, in-memory token store, and MockClient: successful login, missing ID token, failed function response, expired stored token.
- [ ] Implement adapter/secure store/auth service.
- [ ] Run test; expect pass.

### Task 6: Bootstrap + sign-in UI

**Files:**
- Modify: `apps/mobile/lib/app/bootstrap.dart`
- Modify: `apps/mobile/lib/app/providers.dart` (only if a token provider needs exposing)
- Modify: `apps/mobile/lib/features/auth/sign_in_screen.dart`
- Modify: `apps/mobile/lib/features/settings/settings_screen.dart`
- Modify: `apps/mobile/lib/main.dart`
- Modify: `apps/mobile/test/support/test_harness.dart`
- Test: `apps/mobile/test/widget/supabase_sign_in_test.dart`

**Interfaces:**
- `bootstrap`: mock → Supabase (when configured) → Firebase fallback.
- Sign-in screen shows 「使用 LINE 登入」 in Supabase mode and calls `auth.signInWithLine`.
- Settings backend label shows `supabase`.

- [ ] Write failing widget test: Supabase config + fake auth shows LINE button and invokes sign-in.
- [ ] Wire bootstrap and UI.
- [ ] Run widget test; expect pass.

### Task 7: iOS native configuration

**Files:**
- Modify: `apps/mobile/ios/Runner/Info.plist`

**Changes:**
- Add URL scheme `line3rdp.$(PRODUCT_BUNDLE_IDENTIFIER)`.
- Add `LSApplicationQueriesSchemes` with `lineauth2`.

- [ ] Add the plist entries.
- [ ] Run `flutter build ios --profile --no-codesign` first to catch compile/link errors.
- [ ] Add the iOS bundle ID `app.taijian.mobile` to the LINE Login channel App settings (user action).

### Task 8: Device verification

- [ ] Build Profile with:
  `USE_MOCK=false USE_SUPABASE=true SUPABASE_URL=... SUPABASE_ANON_KEY=... LINE_CHANNEL_ID=2012198098`
- [ ] Install on `C9E80CA3-1F63-5044-8D34-74D0C5564008`.
- [ ] Launch, complete native LINE login, verify the same cloud household/animal appears.
- [ ] Add a quick record and verify it appears in the LIFF client.
- [ ] Run `flutter analyze` and `flutter test`.
