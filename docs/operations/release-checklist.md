# Release checklist (free-tier)

## Before merging

- `pnpm lint`, `pnpm typecheck`, `pnpm test`
- `pnpm --filter @taijian/functions test:integration`
- `flutter analyze`, `flutter test`
- `deno check` for changed Edge Functions
- Supabase SQL schema tests for changed tables/functions
- Public-surface smoke: `/feed`, `/s/<token>`, `/r/<token>`, proposals, likes,
  comments, reports and moderation authorization.

## Security

- New tables: RLS enabled, direct `anon`/`authenticated` grants revoked.
- Admin-only commands check `profiles.is_admin` server-side.
- Public tokens are unguessable, read-only, and never expose private relatives.
- `/moderation` is excluded from search indexing.

## iOS build

- Profile build with production Dart defines.
- Install on the physical iPhone and launch.
- Check Today map, Journal photo picker/crop/quota, resident detail, reminders.
- No APNs, widgets, share extension, Apple Sign-In, TestFlight or IAP without
  paid Apple membership.

## Netlify

- Prefer one production deploy from `main`; avoid opening unnecessary preview
  deploys to preserve free credits.
- Verify `/moderation` sends `X-Robots-Tag: noindex`.
- Check the current credit balance before large web changes.
