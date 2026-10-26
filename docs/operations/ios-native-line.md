# Flutter iOS + Native LINE SDK

The iOS app can run against Supabase with a native LINE Login session. Mock mode
remains the default for debug builds; real mode is selected with dart-defines.

## Requirements

- Flutter 3.47+ (Dart 3.13)
- iOS 15+
- Bundle ID `app.taijian.mobile`
- LINE Login Channel ID `2012198098`
- Supabase project `bqezqvhdmqanxgzfvdag`

## LINE Developers

In the LINE Login channel's **App settings**, set the iOS bundle ID to:

```text
app.taijian.mobile
```

The iOS URL scheme in `ios/Runner/Info.plist` is:

```text
line3rdp.app.taijian.mobile
```

`lineauth2` is in `LSApplicationQueriesSchemes`.

## Flow

1. `flutter_line_sdk` opens the native LINE app with the `openid` + `profile` scopes.
2. The app sends the LINE ID token to the `line-login` Edge Function.
3. `line-login` returns a short-lived custom JWT and the Supabase profile ID.
4. The JWT is stored in iOS Keychain (`flutter_secure_storage`).
5. `SupabaseReadStore` polls PostgREST; writes use `execute-command`.
6. The existing outbox keeps writes idempotent and retryable.

The custom JWT currently expires after 2 hours; Spec 1
(`2026-10-26-taijian-foundation-identity-design.md`) replaces this with a
refresh-token session.

## Build

```bash
cd apps/mobile
flutter build ios --profile \
  --dart-define=USE_MOCK=false \
  --dart-define=USE_SUPABASE=true \
  --dart-define=SUPABASE_URL=https://bqezqvhdmqanxgzfvdag.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=sb_publishable_JokBny3AnM8sCs75W3RsCA_TBN24fWl \
  --dart-define=LINE_CHANNEL_ID=2012198098 \
  --dart-define=LIFF_URL=https://liff.line.me/2012198098-yDGNuYOH
```

Do **not** put the Supabase secret key or `JWT_SECRET` in the app.

### Personal-team local installs

Apple sign-in, TestFlight, App Store distribution, APNs remote push, and real
StoreKit/IAP are **deferred**; current iOS delivery is a local Profile install
only. The Xcode project still carries the legacy Sign in with Apple entitlement
while the Firebase path exists. A personal Apple team cannot provision that
capability, so for a local Profile install temporarily point the Profile build
at `RunnerDebug.entitlements`, build, then revert the Xcode project change:

```bash
# local-only; do not commit
python3 - <<'PY'
from pathlib import Path
p = Path('ios/Runner.xcodeproj/project.pbxproj')
s = p.read_text()
start = s.index('249021D4217E4FDB00AE95B9 /* Profile */')
end = s.index('name = Profile;', start) + len('name = Profile;')
segment = s[start:end].replace(
    'CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;',
    'CODE_SIGN_ENTITLEMENTS = Runner/RunnerDebug.entitlements;',
)
p.write_text(s[:start] + segment + s[end:])
PY
flutter build ios --profile ...  # same defines as above
git checkout -- ios/Runner.xcodeproj/project.pbxproj
```

Install with `xcrun devicectl device install app --device <UDID> build/ios/iphoneos/Runner.app`.

## Verification

- `flutter analyze` clean
- `flutter test` 59 passing
- Physical iPhone install/launch verified
- Native LINE login updates the same `line_users` mapping and shows the existing
  household/animals from the LIFF account
