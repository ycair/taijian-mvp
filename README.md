# 苔間 · Taijian

> LINE-first, conflict-safe care log for reptiles and exotic pets.  
> 把每一次照顧，留在同一個家。

**Status:** Private demo — Supabase free tier, LINE LIFF/Bot, Flutter iOS local Profile installs.  
**Working name:** 苔間（商標／網域尚未檢索）  
**Target:** iOS full experience; LIFF/Bot cover the core care flows.

---

## What this is

苔間 is a shared care log for reptile and exotic-pet households. It is designed
for multiple caregivers, not as a single-device notebook:

- **LINE LIFF** — Today, residents, quick records, invites, reminders, settings.
- **LINE Bot** — Today summary, quick care commands, invites.
- **Flutter iOS** — Full editing, records analytics, journal, local notifications,
  offline outbox, conflict resolution, commerce sandbox.
- **One account across surfaces** — LINE, Google, and guest identities resolve to
  the same `profiles.id`; households and permissions are shared.

## Implemented

### Foundation

- LINE, Google, and iOS guest sign-in; account linking without automatic identity merge.
- Rotating refresh sessions, revocation, active-session checks, account deletion.
- Households, owner/caretaker roles, single-use invites, member removal/handover.
- Custom JWT + Postgres RLS; writes are server-authoritative through `execute-command`.

### Residents — 2A

- Species catalog, resident profile, adoption/birth dates, color and pattern avatars.
- Parent/offspring lineage with cycle and two-parent limits; privacy-safe placeholder
  for relatives the viewer cannot access.
- Irreversible memorial state; reminders disabled and records read-only.
- Own-household and other-user transfers, with atomic movement of records/reminders.
- Local groups, search, custom order, memorial section.

### Records — 2B

- Feeding (food/refusal/quantity), water, weight, length, poop, shed, activity,
  medical, note, and custom measurements.
- Add, owner/creator edit, soft delete, revision conflicts, audit logs.
- Household timeline with date range and per-resident analytics.
- Weight/length/custom-measurement charts, care-frequency counts, attention summary.
- `record_analytics` RPC; memorial records remain read-only.

### Reminders — 2C

- Daily, weekly, and every-N-days schedules with timezone-aware occurrences.
- Seven-day weekly overview and completion status.
- iOS local notifications, opt-in per device, scheduled from the current household.
- No APNs/FCM remote push and no Widgets; local notifications are rescheduled by
  the app when data changes.

### Public resident records

- Owner opt-in per resident; default private.
- Public residents expose a read-only `/r/<token>` page with all care records.
- Public Journal tags and public lineage can link to public residents; private relatives remain hidden.
- No household/UID data is returned; reverting to private invalidates the link.

### Journal

- Household photo journeys: title, body, date, resident tags, up to five photos,
  cover photo, per-photo captions.
- Private Supabase Storage bucket with signed URL reads.
- Visibility: household, unlisted link (J2), or public (J3).
- Public read-only web pages:
  - `/s/<token>` — one unlisted journey
  - `/feed` — public journeys
- J3 currently has public likes, comments, and entry reports. Follows, blocks, and moderation console are still deferred.
- System share sheet; no public storage bucket and no direct client writes.

### Proposals

- Authenticated proposal board with create and one-vote-per-profile upvotes.
- `proposals_list()` RPC, Realtime refresh, and a Settings entry.
- Status administration/comments are deferred.

### Map / dens

- Shared household map with default zones (苔庭/水盆/躲藏/曬台); Today has a map entry card.
- Drag active residents to normalized positions; positions are stored through
  server commands and shared with household members.
- Add/delete zones; memorial residents stay off the map.
- Warm hand-drawn vector backdrop, no copied map tiles or sprites.

### Commerce sandbox

- Demo catalog and stock, in-memory cart, order creation/cancellation.
- Daily points check-in, points ledger, redemption at 1 point = NT$1.
- Three supporter plans with manual 30-day sandbox activation.
- No StoreKit/IAP, real payment, shipping, 7-11 integration, or fulfillment.
- Writes go through server commands; orders/points/subscriptions have RLS reads.

### Web

- LIFF shell refreshed to match the 苔間 visual language (warm moss palette,
  brand header, rounded cards, icon navigation).
- Public journal pages are outside the authenticated app shell.

### Sync

- Postgres/RLS reads with background polling.
- Successful outbox writes trigger an immediate provider refresh, so local changes
  no longer require pull-to-refresh.
- Supabase Realtime subscriptions for household/profile tables refresh providers
  immediately across devices; polling remains the fallback.

## Architecture

```text
LINE Login / Google / guest
             │
       custom JWT session
             │
┌────────────┴─────────────┐
│ Supabase Edge Functions  │
│ auth · execute-command   │
│ line-login · line-webhook│
│ journal-public           │
└────────────┬─────────────┘
             │
┌────────────┴─────────────┐
│ Postgres + RLS           │
│ PostgREST                │
│ Storage (journal-photos) │
└────────────┬─────────────┘
             │
   ┌─────────┴─────────┐
   │                   │
Flutter iOS         React LIFF
```

- **Reads** are scoped by RLS or privacy RPCs/functions.
- **Writes** go through `execute-command`; clients cannot write tables directly.
- **Journal links/public feed** use the `journal-public` Edge Function, which checks
  visibility and creates short-lived signed photo URLs.
- **Identity** is `profiles.id`; the same profile can have LINE and Google identities.

## Repository layout

```text
apps/
  mobile/                Flutter iOS (main client)
  liff-sb/               React + Vite LIFF, public journal pages
supabase/
  migrations/            Postgres schema, RLS, Storage policies
  functions/             auth, line-login, execute-command, line-webhook, journal-public
  tests/                 SQL assertions
services/functions/      Archived Firebase Phase 1 reference
packages/                Shared domain/reference packages
docs/
  superpowers/specs/     Design specs (identity, 2A, journal social)
  operations/            Cloud, iOS, scheduler, TTL, acceptance notes
```

The Firebase Phase 1 code remains as historical reference; Supabase is the active
demo backend.

## Local development

Prerequisites: Node 22.x, pnpm 10, Docker/Supabase CLI, Flutter 3.47 at
`/Volumes/YCAIR/flutter/bin/flutter` in this workspace.

```bash
pnpm install
pnpm supabase:start
pnpm supabase:reset
cp supabase/functions/.env.example supabase/functions/.env
cp apps/liff-sb/.env.example apps/liff-sb/.env.local
# Put the local publishable key into apps/liff-sb/.env.local
```

Run backend functions and LIFF in separate terminals:

```bash
pnpm supabase:functions
pnpm dev:liff-sb
```

Open `http://localhost:5174/?mock=UtestA` and press **以 LINE 登入**.

Flutter:

```bash
cd apps/mobile
/Volumes/YCAIR/flutter/bin/flutter pub get
/Volumes/YCAIR/flutter/bin/flutter run -d "iPhone 17 Pro" # mock mode
```

The cloud iOS Profile build and local device-install commands are in
[`docs/operations/ios-native-line.md`](docs/operations/ios-native-line.md).

## Cloud deployment

Current project: `bqezqvhdmqanxgzfvdag` (Supabase free tier).

- Migrations and RLS live in `supabase/migrations/`.
- Edge Functions: `auth`, `line-login`, `execute-command`, `line-webhook`,
  `journal-public`.
- Public LIFF build: `apps/liff-sb/.env.production` contains only the public cloud
  URL, publishable key, and LIFF ID. The Vite production build fails if the
  Supabase URL is missing or points at loopback.
- Secrets such as `JWT_SECRET`, LINE Messaging secrets, and Google server client ID
  stay in Supabase secrets, never in git.
- Deployment details: [`docs/operations/supabase-cloud.md`](docs/operations/supabase-cloud.md).

## Verification

```bash
cd apps/mobile && /Volumes/YCAIR/flutter/bin/flutter analyze && /Volumes/YCAIR/flutter/bin/flutter test
cd supabase/functions && deno test --allow-env --allow-net --allow-read
cd apps/liff-sb && npm test && npm run typecheck && npm run build
```

Validation includes SQL RLS/RPC assertions, local outbox/command integration,
notification planner tests, journal Storage tests, commerce sandbox tests, cloud
smoke tests, and a physical iPhone Profile install. Main requires a PR and the
GitHub `test` check.

## Security notes

- No real payment or StoreKit/IAP is connected.
- Public journal photos are served through short-lived signed URLs, not a public bucket.
- Unlisted links are bearer links: anyone with the link can read the entry; do not
  treat them as household-private.
- Public posts are readable without a household session; do not post private
  resident details or photos without consent.
- UGC moderation/reporting is required before enabling public comments/likes broadly.
- Do not commit LINE/Firebase/Supabase secret keys or service-role credentials.

## Deferred / not yet started

- Journal reactions, comments, follow graph, and moderation/reporting.
- Journal stickers, freeform collage, and external social posting; crop and monthly photo quota are implemented.
- Following and blocking public Journal authors; a following-only feed is still pending.
- Journal report moderation console at `/moderation` (admin-only server checks).
- Real StoreKit/IAP, payments, shipping, order fulfillment, and admin shop console.
- APNs/FCM remote push, Widgets, Share Extension.
- Apple Sign-In.
- TestFlight/App Store distribution and real App Store subscriptions.
- Release polish: accessibility, privacy/terms, E2E hardening, Flutter/Deno CI.

## Documentation

- [Foundation and identity spec](docs/superpowers/specs/2026-10-26-taijian-foundation-identity-design.md)
- [Residents / lineage / transfer spec](docs/superpowers/specs/2026-10-26-care-core-residents-lineage-design.md)
- [Journal social J1/J2/J3 spec](docs/superpowers/specs/2026-10-26-journal-social-design.md)
- [Supabase cloud operations](docs/operations/supabase-cloud.md)
- [iOS native LINE/Profile](docs/operations/ios-native-line.md)
- [Journal photo operations](docs/operations/journal-photo-core.md)
- [Journal comments and reports](docs/operations/journal-comments.md)
- [Journal quota and crop](docs/operations/journal-quota.md)
- [Journal follows and blocks](docs/operations/journal-follow-block.md)
- [Journal moderation](docs/operations/moderation.md)
- [Public resident records](docs/operations/public-resident-records.md)
- [Security audit 2026-10-28](docs/security/2026-10-28-security-audit.md)
- [Map core design](docs/superpowers/specs/2026-10-27-map-core-design.md)
- [Map operations](docs/operations/map-core.md)
- [Commerce sandbox](docs/operations/commerce-sandbox.md)

苔間 is an original product direction. It does not include the original app's
source, sprites, screenshots, copy, or branding.

## Brand

苔間 is a working name. Before a public launch: trademark search, domain/social
handle check, App Store naming, and original logo/illustration work.

## License

Proprietary. All rights reserved. Not open source.
