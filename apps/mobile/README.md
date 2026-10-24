# 苔間 · Flutter iOS（Phase 2）

Same Firebase command API as LIFF, with an offline outbox and conflict UI.
Runs entirely in-memory when **mock mode** is on, so no Firebase project or
`GoogleService-Info.plist` is needed to develop or run the simulator.

## Quick start (mock mode)

```bash
cd apps/mobile
/Volumes/YCAIR/flutter/bin/flutter pub get
/Volumes/YCAIR/flutter/bin/flutter run -d "iPhone 17 Pro"
```

Debug builds default to `USE_MOCK=true`. The app starts signed in as the seeded
owner 「小苔」 in 「苔間小屋」, with three residents, reminders, records, and one
task already completed by 「阿川」. Sign out from Settings to see the gate and
the mock Apple/Google sign-in.

```bash
# Explicit mock mode (also works in profile/release)
flutter run --dart-define=USE_MOCK=true

# Start signed out, to exercise the auth gate every launch
flutter run --dart-define=USE_MOCK=true --dart-define=MOCK_START_SIGNED_IN=false
```

Mock mode still uses the real Drift outbox on disk. Writes go through
`MockCommandApi` with the same command names, revision checks, idempotency keys,
and `CONFLICT` responses as the server.

## Real Firebase mode

1. Create a Firebase project (dev/staging/prod should be separate).
2. Add an iOS app with bundle id `app.taijian.mobile`.
3. Enable **Authentication → Sign-in method → Apple** and **Google**.
4. Download `GoogleService-Info.plist` from the Firebase console.
5. Copy it to `ios/Runner/GoogleService-Info.plist` and add it to the **Runner**
   target in Xcode (File → Add Files…, target membership checked). It must be in
   Copy Bundle Resources.
6. Replace the placeholder `REVERSED_CLIENT_ID` URL scheme in
   `ios/Runner/Info.plist` with the value from the real plist.
7. Enable the **Sign in with Apple** capability for the Runner target (the
   committed `Runner.entitlements` already declares it), and create an Apple
   Services ID / key as required by Firebase.
8. For Google Sign-In, add the `REVERSED_CLIENT_ID` URL scheme in Xcode; the
   example placeholder is already present.
9. Deploy the Phase 1 functions (`executeCommand` in `asia-east1`) and Firestore
   rules/indexes.
10. Run:

```bash
flutter run --dart-define=USE_MOCK=false \
  --dart-define=LIFF_URL=https://liff.line.me/1234567890-AbCdEfGh
```

`USE_MOCK=false` initializes Firebase Core, Auth, Firestore, Functions, Messaging,
and App Check. A missing plist or missing configuration shows a readable bootstrap
error instead of a white screen.

### Sign-out and local data

Signing out from Settings:

1. deletes that account's plaintext outbox rows (`purgeForUid`),
2. signs out Firebase Auth,
3. terminates Firestore and calls `clearPersistence()` so the next account cannot
   read the previous account's on-disk cache.

iOS limitation: `clearPersistence()` requires no active Firestore client, so the
app terminates it first. If another Firebase component reopens Firestore during
sign-out, the clear can fail; sign-out still proceeds, the cache remains until the
next successful clear/OS cleanup, and server rules keep reads membership-scoped.
Unsaved offline changes are intentionally discarded on sign-out for privacy.

### App Check

App Check is enabled by default in real mode with App Attest → DeviceCheck
fallback. For a debug build, register a debug token in the Firebase console and
pass it at build time:

```bash
flutter run --dart-define=USE_MOCK=false \
  --dart-define=APP_CHECK_DEBUG_TOKEN=xxxx-xxxx-xxxx
```

Disable it temporarily with `--dart-define=ENABLE_APP_CHECK=false` only while
bringing up a new project.

### Push (FCM)

`FirebaseBootstrap` requests notification permission, registers with FCM, and
reports only whether APNs is available. Token values are kept in memory for a
future device-registration command and are **never written to logs**, together
with UIDs and emails.

A real device + APNs auth key + the **Push Notifications** capability are required
for delivery. The committed `Runner.entitlements` intentionally omits
`aps-environment` so unsigned simulator/device builds keep working; add the
capability in Xcode when setting up signing. Mock mode and the simulator never
require APNs.

Token registration to the backend is intentionally not implemented in this phase:
Phase 1 does not define a `device.register` command, and Firestore client writes
are denied. Add a command before enabling server-side push.

### LINE linking

Native LINE SDK is out of scope without a LINE channel. Settings → 「連結 LINE」
opens `${LIFF_URL}/link` in the system browser/LINE via `url_launcher`; the LIFF
page completes the server-side mapping. `LIFF_URL` defaults to a placeholder
(`https://liff.line.me/0000000000-taijian`), which the UI labels as unconfigured.

## Architecture

```text
lib/
  app/            bootstrap, Riverpod providers, go_router, shell
  core/           config, Direction B theme, models, time/schedule helpers
  data/
    command/      CommandApi + Firebase callable implementation
    mock/         seeded in-memory store, command API, auth
    read/         ReadStore (Firestore / mock)
    outbox/       Drift table + idempotent flush/conflict handling
  features/
    auth/         AuthService, Firebase Apple/Google, sign-in gate
    today/        TodayEngine, Today screen
    animals/      list, add, detail, quick actions
    records/      timeline, quick record sheet
    reminders/    create/edit/delete
    household/    create, invite, profile updates
    settings/     profile, household, invite, LINE link, sync, sign out
```

- **Reads** use `ReadStore` (Firestore snapshots in real mode, streams over the
  mock store otherwise).
- **Writes** always go through `CommandService` → `Outbox`, except operations
  whose response is needed immediately (`household.create`, `member.invite`),
  which call `CommandApi` directly and are online-only.
- Today is built from each reminder's schedule in its stored timezone, not from
  `nextDueAt`, because the backend scheduler advances `nextDueAt` after delivery.
  A completion is matched by `reminderId + dueDate` (the server's deterministic
  key).
- Outbox rows are scoped by UID and keep `commandId`, `baseRevision`, status,
  attempts, last error, and the conflict's current document/revision.
  - retry reuses the **same** `commandId`;
  - `CONFLICT` keeps the row and shows the banner;
  - 「查看最新」 drops the row and lets the stream render fresh data;
  - 「保留我的」 resubmits the local payload with the conflict revision;
  - failed rows can be retried (attempts reset) or discarded after confirmation;
  - a flush that is already running drains rows enqueued during its pass;
  - a 30-second timer and app-resume hook retry after connectivity returns;
  - a pending `task.complete` renders as「已完成 · 同步中…」 until it lands.
- Online-only commands (`household.create`, `member.invite`) keep one
  `commandId` per logical attempt, so a lost response can be retried without
  creating a second household/invite.

## Commands

```bash
flutter analyze
flutter test
flutter build ios --simulator --no-codesign
```

### Tests

- `test/features/today_engine_test.dart` — timezone, overdue/upcoming/completed
  ordering, archived animals, weekly/interval schedules, completion date keys,
  `createdAt`/re-enable floors.
- `test/data/outbox_test.dart` — commandId idempotency, conflict retention,
  `keepMine` rebase, single-flight drain, retry attempts reset/discard, empty UID,
  and sign-out purge.
- `test/data/command_attempt_test.dart` — logical command-id reuse and
  timeout-after-commit retry without duplicate households.
- `test/data/mock_command_test.dart` — record id duplicate semantics, strict
  record types, owner-only animal lifecycle.
- `test/contract/command_contract_test.dart` — queued payloads checked against
  the Phase 1 command schemas (ids, enums, dates, schedules, timezones).
- `test/features/reminder_schedule_edit_test.dart` — interval start-date anchor.
- `test/features/pending_completion_keys_test.dart` — optimistic completion keys.
- `test/widget/auth_gate_test.dart` — sign-in → shell → sign-out and stable router.
- `test/widget/smoke_test.dart` + `offline_completion_test.dart` — Today, Animals,
  animal admin actions, and the pending-completion overlay.

## Secrets

Never commit:

- `ios/Runner/GoogleService-Info.plist`
- APNs `.p8` keys, Apple/Google service credentials, LINE channel secret/token
- `.env` files with real values

Committed placeholders: `ios/Runner/GoogleService-Info.plist.example` and
`--dart-define` defaults in `lib/core/config/app_config.dart`.

## Known Phase 2 limits

- No native LINE SDK, no Apple/Google credentials in the repo.
- FCM token registration is log-only until a backend command exists.
- Account deletion is a Phase 3 item (App Store submission needs it).
- `drift_flutter` stores the outbox in application documents; a cleared app
  removes unsent offline commands. Explicit sign-out purges the account's rows.
- APNs entitlement/capability and push registration are not configured yet (see
  Push above).
