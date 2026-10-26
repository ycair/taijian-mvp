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

The app now stores a 1-hour access JWT plus a rotating 30-day refresh token;
`SupabaseRestClient` refreshes once on 401 and retries.

## Build

```bash
cd apps/mobile
flutter build ios --profile \
  --dart-define=USE_MOCK=false \
  --dart-define=USE_SUPABASE=true \
  --dart-define=SUPABASE_URL=https://bqezqvhdmqanxgzfvdag.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=sb_publishable_JokBny3AnM8sCs75W3RsCA_TBN24fWl \
  --dart-define=LINE_CHANNEL_ID=2012198098 \
  --dart-define=LIFF_URL=https://liff.line.me/2012198098-yDGNuYOH \
  --dart-define=GOOGLE_IOS_CLIENT_ID=590439259841-9e0b8dsauu68obh44ddk94ql2mqmfv34.apps.googleusercontent.com \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=590439259841-gu96vci2ral20hv4ut2i96gmcl0l3lbu.apps.googleusercontent.com
```

Do **not** put the Supabase secret key or `JWT_SECRET` in the app.

### Local Profile installs

Apple sign-in, TestFlight, App Store, APNs remote push, and real StoreKit/IAP are
deferred. `Runner.entitlements` no longer requests Sign in with Apple, so a local
Profile build signs with the personal team without a temporary entitlement
workaround.

Build and install:

```bash
flutter build ios --profile <dart-defines above>
xcrun devicectl device install app --device <UDID> build/ios/iphoneos/Runner.app
```

Google login needs the iOS OAuth client in `GIDClientID`, the Web client in
`GIDServerClientID`, and the Web client in the Edge secret
`GOOGLE_SERVER_CLIENT_ID`. Add the test Google account under Google Auth Platform
→ Test users.

## Verification

- `flutter analyze` clean
- `flutter test` 65 passing
- Physical iPhone install/launch verified
- Native LINE login updates the same `line_users` mapping and shows the existing
  household/animals from the LIFF account
- Guest login and refresh rotation verified locally; Google awaits device test
