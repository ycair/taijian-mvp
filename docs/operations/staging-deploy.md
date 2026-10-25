# Staging deployment — taijian-staging

Status: **project created, apps created, Firestore/Functions blocked on billing**.

## Created resources

| Resource | Value |
|---|---|
| Firebase project | `taijian-staging` |
| Project number | `960075136297` |
| Firestore location | `asia-east1` (database not created yet) |
| Web app | `1:960075136297:web:810c49280691c79154cb38` |
| iOS app | `1:960075136297:ios:ab1e46be72419cde54cb38` |
| iOS bundle ID | `app.taijian.mobile` |
| Hosting default site | `taijian-staging.web.app` |

`apps/mobile/ios/Runner/GoogleService-Info.plist` was generated from the iOS app and is gitignored.

## Hard blocker: billing

The project is on the free plan. Creating the default Firestore database, Cloud Functions,
Cloud Build, Artifact Registry, Cloud Scheduler, Secret Manager, and Cloud Run require billing.

The only billing account visible to `ycair.support@gmail.com` is **closed**:

```
0148A8-EAD3A0-E31471  我的帳單帳戶  OPEN=False
```

To proceed:

1. Open <https://console.cloud.google.com/billing/0148A8-EAD3A0-E31471?project=taijian-staging>
   and add a payment method / reopen the account, or create a new billing account.
2. Link it:
   ```bash
   /Volumes/YCAIR/google-cloud-sdk/bin/gcloud billing projects link taijian-staging \
     --billing-account=<OPEN_ACCOUNT_ID>
   ```
3. Verify:
   ```bash
   /Volumes/YCAIR/google-cloud-sdk/bin/gcloud billing projects describe taijian-staging
   ```

## Enable APIs

```bash
/Volumes/YCAIR/google-cloud-sdk/bin/gcloud services enable \
  firestore.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com \
  run.googleapis.com eventarc.googleapis.com artifactregistry.googleapis.com \
  firebasehosting.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com \
  fcm.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com \
  pubsub.googleapis.com storage.googleapis.com \
  --project taijian-staging
```

App Check is optional until the LIFF reCAPTCHA Enterprise key exists.

## Create Firestore default database

```bash
cd /Volumes/YCAIR/taijian-impl
pnpm exec firebase firestore:databases:create "(default)" \
  --location asia-east1 --project taijian-staging
```

Do not create a database named `default`; Firebase expects `(default)`.

## Functions environment

Create `services/functions/.env.taijian-staging` locally (gitignored):

```text
APP_ENV=staging
LINE_LOGIN_CHANNEL_ID=<staging LINE Login channel ID>
LINE_MESSAGING_CHANNEL_ID=<staging Messaging API channel ID>
LINE_MESSAGING_CHANNEL_SECRET=<secret>
LINE_CHANNEL_ACCESS_TOKEN=<token>
LINE_VERIFY_URL=https://api.line.me/oauth2/v2.1/verify
LINE_API_BASE=https://api.line.me
APP_BASE_URL=https://taijian-staging.web.app
LIFF_ID=<staging LIFF ID>
ENFORCE_APP_CHECK=false
```

The config refuses `test-*` secrets when `APP_ENV != dev`, so staging cannot boot with
the local mock values. Do not commit this file.

## Deploy

```bash
cd /Volumes/YCAIR/taijian-impl
pnpm typecheck
pnpm test
pnpm --filter @taijian/functions test:integration
pnpm --filter @taijian/functions test:rules
pnpm build
pnpm deploy:functions
pnpm exec firebase deploy \
  --only firestore:rules,firestore:indexes,functions,hosting \
  --project taijian-staging
```

Hosting currently serves `apps/liff/dist`. Build the LIFF with the staging Firebase
web config first:

```bash
cd apps/liff
pnpm build --mode staging
```

Put the public web config in `apps/liff/.env.staging.local` (gitignored), including
`VITE_LIFF_ID` once the LIFF app exists.

## Auth providers

- **Google**: create an iOS OAuth client for `app.taijian.mobile` and a web OAuth client
  for `taijian-staging.firebaseapp.com`; add the reversed client ID URL scheme to the iOS
  `Info.plist`.
- **Apple**: requires a paid Apple Developer Program team. The current personal team
  (`RKXG5LCZ4K`) does not support Sign in with Apple. Add the capability to the Release
  entitlements and provisioning profile only after the paid team is available.
- **LINE**: create a LINE Login channel + LIFF app under the same provider as the
  Messaging API channel. Set the LIFF endpoint to the Hosting URL, add the webhook URL
  `https://asia-east1-taijian-staging.cloudfunctions.net/lineWebhook`, and set the
  channel ID/secret/access token in the Functions env.

## TTL policies

After the database exists:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=commands --enable-ttl --project taijian-staging
gcloud firestore fields ttls update expiresAt \
  --collection-group=rateLimits --enable-ttl --project taijian-staging
gcloud firestore fields ttls update expiresAt \
  --collection-group=loginRateLimits --enable-ttl --project taijian-staging
gcloud firestore fields ttls update expiresAt \
  --collection-group=lineEvents --enable-ttl --project taijian-staging
gcloud firestore fields ttls update expiresAt \
  --collection-group=notificationLog --enable-ttl --project taijian-staging
```

## Acceptance after deploy

- Two LINE test accounts: create household, invite, accept, caretaker access.
- Record feeding/weight from LIFF and Bot; both appear.
- Complete the same task from both; one completion.
- Offline retry with the same commandId; one record.
- Delete an animal with >200 records; `cleanupPending` clears after the purge run.
- Delete an account; LINE mapping is tombstoned and cannot resurrect.
- App Check enforcement only after the LIFF key is verified.

## Current blockers

1. **Billing closed** — default Firestore/Functions cannot deploy.
2. **LINE Login/LIFF** — no staging channel/LIFF ID yet.
3. **Apple paid team** — personal team cannot sign in with Apple.
4. **APNs** — no key/capability yet; FCM is log-only.
