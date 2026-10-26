# Supabase cloud demo

## Project

- Project ref: `bqezqvhdmqanxgzfvdag`
- API URL: `https://bqezqvhdmqanxgzfvdag.supabase.co`
- Publishable key: `sb_publishable_JokBny3AnM8sCs75W3RsCA_TBN24fWl`
  (public key; safe for browser/LIFF)
- Do **not** put the secret key, JWT secret, or LINE channel secrets in this repo.

## Applied migrations

1. `20261025153650_taijian_init`
2. `20261025153657_profile_visibility`
3. `20261025153808_api_hardening`
4. `20261025153837_function_execute_hardening`
5. `20261026065015_foundation_identity`
6. `20261026072934_auth_hardening`
7. `20261026120000_care_core_residents`
8. `20261026130000_care_core_advisors`
9. `20261026140000_care_core_records_analytics`

2A adds the read-only `species` catalog, resident profile fields
(`avatar_pattern`, `memorial_at`, `memorial_note`), lineage edges, and transfer
history. Clients cannot read `animal_lineage` or `animal_transfers` directly;
privacy-scoped reads go through `lineage_for_animal(uuid)` and
`list_animal_transfers()`.

2B adds the `length` record type and the household-scoped
`record_analytics(...)` RPC. Record edits/deletes are owner-or-creator only;
memorial resident records remain read-only.

Schema notes:

- RLS is enabled on every table.
- `anon` has no table/function access.
- `authenticated` can only `SELECT` the household-scoped read tables.
- Server-only tables (`invites`, `audit_logs`, `line_users`, `commands`,
  `rate_limits`, `notification_log`, `line_events`) have no client grants.
- `is_household_member`, `is_household_owner`, and `list_invites` are
  `SECURITY DEFINER` helpers with explicit `EXECUTE` grants only to
  `authenticated`.

## Deployed functions

- `auth` (`verify_jwt=false`; LINE/Google/guest/refresh/link/unlink/logout/delete/identities)
- `line-login` (`verify_jwt=false`; compatibility wrapper; returns access+refresh+legacy token)
- `execute-command` (`verify_jwt=false`; verifies access JWT and active session; v8 includes 2A resident/lineage/transfer commands and 2B record update/delete)
- `line-webhook` (`verify_jwt=false`; verifies the LINE signature)

`auth` and `execute-command` require a valid session. `JWT_SECRET` must be the
project's legacy JWT secret used by PostgREST; refresh tokens are stored hashed
in `auth_sessions`.

## Required Edge Function secrets

Set these in the dashboard at:

`https://supabase.com/dashboard/project/bqezqvhdmqanxgzfvdag/functions/secrets`

| Name | Source | Secret? |
|---|---|---|
| `JWT_SECRET` | Project Settings → API → JWT secret | yes |
| `LINE_LOGIN_CHANNEL_ID` | LINE Login channel | no |
| `LIFF_ID` | LIFF app under the LINE Login channel | no |
| `GOOGLE_SERVER_CLIENT_ID` | Google **Web** OAuth client ID (ID-token audience) | no |
| `LINE_MESSAGING_CHANNEL_SECRET` | Messaging API channel (Bot only) | yes |
| `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API channel (Bot only) | yes |

Do **not** set `ALLOW_MOCK_LINE` in the cloud project. Mock login is local-only.

Alternatively, with the Supabase CLI logged in and linked:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref bqezqvhdmqanxgzfvdag
# create a gitignored local env file with the values above
pnpm exec supabase secrets set --env-file .env.production
```

Secrets are available immediately; no function redeploy is needed after setting
them.

## LIFF / LINE channels

The LINE console now rejects adding LIFF to a **Messaging API** channel. Use a
**LINE Login channel**:

1. Create/select a provider in LINE Developers.
2. Create a **LINE Login** channel.
3. Add a **LIFF app** under that LINE Login channel.
4. Set the LIFF endpoint URL to the deployed LIFF site (HTTPS).
5. Use the LIFF ID for `VITE_LIFF_ID` and the LINE Login Channel ID for
   `LINE_LOGIN_CHANNEL_ID`.
6. Create a separate **Messaging API** channel for the Bot; use its channel
   secret/access token for `line-webhook`, and set its webhook URL to:

`https://bqezqvhdmqanxgzfvdag.supabase.co/functions/v1/line-webhook`

LINE MINI App is the rebranded/recommended path for eligible accounts (Japan,
or Taiwan with local subsidiary approval). If the account is not eligible,
continue with a normal LIFF app under the LINE Login channel; existing and new
LIFF apps remain supported.

## LINE Bot setup

The Bot needs a separate **Messaging API** channel under the same provider;
do not put the Bot token on the LINE Login channel.

1. Create a Messaging API channel named `苔間 Bot`.
2. Add these Edge Function secrets:
   - `LINE_MESSAGING_CHANNEL_SECRET`
   - `LINE_CHANNEL_ACCESS_TOKEN`
3. Set the Messaging API webhook URL to:
   `https://bqezqvhdmqanxgzfvdag.supabase.co/functions/v1/line-webhook`
4. Enable **Use webhook** in the Messaging API channel.
5. Add the Bot as a friend (QR code in the channel) and test.

Supported text commands:

- `今日` / `今天`
- `居民` / `動物`
- `餵食 <居民> [備註]`
- `體重 <居民> <克數>`
- `完成 <任務>`
- `邀請` (owner only; creates a 7-day single-use LIFF invite)
- `說明`

A `follow` event sends a welcome message with the LIFF link. Dates for
`今日` and `完成` use `Asia/Taipei` rather than the database UTC date.

## LIFF app

- LINE Login Channel ID: `2012198098` (public)
- LIFF ID: `2012198098-yDGNuYOH` (public)
- LIFF URL: `https://liff.line.me/2012198098-yDGNuYOH`

The LIFF app is under the LINE Login channel. Its Endpoint URL must be updated
to the deployed HTTPS site after the first static deploy; do not leave it as
`https://example.com`.

Required public Edge Function secrets:

| Name | Value |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | `2012198098` |
| `LIFF_ID` | `2012198098-yDGNuYOH` |

`JWT_SECRET` is configured. Do not set `ALLOW_MOCK_LINE` on the cloud project.
Access JWTs are 1 hour; refresh tokens rotate every use and expire after 30 days.

## Static deploy (Netlify Drop)

Build with the production env file:

```bash
cd apps/liff-sb
cp .env.production.example .env.production.local
# fill VITE_LIFF_ID and confirm the cloud URL/publishable key
pnpm build
```

The build includes `public/_redirects` (`/* /index.html 200`) so LIFF invite
links and client-side routes work on Netlify/Cloudflare Pages.

`apps/liff-sb/.env.production` is committed deliberately: it contains only the
public cloud Supabase URL/publishable key and the LIFF ID. The Vite production
build fails if `VITE_SUPABASE_URL` is missing or points at loopback, which
prevents shipping a bundle that asks third-party browsers to call
`127.0.0.1:54321`. If Netlify project-level variables are set, they must contain
the same cloud values.

Upload the `dist` folder (or its zip) at `https://app.netlify.com/drop`, then:

1. Copy the generated `https://<name>.netlify.app` URL.
2. Update the LIFF app Endpoint URL in LINE Developers to that URL.
3. Open `https://liff.line.me/2012198098-yDGNuYOH` in LINE.

For a custom/stable host later, Cloudflare Pages or GitHub Pages can use the
same `dist` and `_redirects` output.

## Client environment for cloud

```text
VITE_SUPABASE_URL=https://bqezqvhdmqanxgzfvdag.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_JokBny3AnM8sCs75W3RsCA_TBN24fWl
VITE_LIFF_ID=2012198098-yDGNuYOH
VITE_USE_MOCK_LINE=false
```

The current local `apps/liff-sb/.env.local` points at the local Docker stack;
switch it only after the cloud secrets and LINE channel are ready.
