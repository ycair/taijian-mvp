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

- `line-login` (`verify_jwt=false`; verifies LINE ID token itself)
- `execute-command` (`verify_jwt=false`; verifies the custom JWT itself)
- `line-webhook` (`verify_jwt=false`; verifies the LINE signature)

The functions are deployed, but **`line-login` and `execute-command` cannot
work until the `JWT_SECRET` function secret is set**. `JWT_SECRET` must be the
project's legacy JWT secret used by PostgREST, not a new random value.

## Required Edge Function secrets

Set these in the dashboard at:

`https://supabase.com/dashboard/project/bqezqvhdmqanxgzfvdag/functions/secrets`

| Name | Source | Secret? |
|---|---|---|
| `JWT_SECRET` | Project Settings → API → JWT secret | yes |
| `LINE_LOGIN_CHANNEL_ID` | LINE Login channel | no |
| `LIFF_ID` | LIFF app under the LINE Login channel | no |
| `LINE_MESSAGING_CHANNEL_SECRET` | Messaging API channel | yes |
| `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API channel | yes |

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

## Client environment for cloud

```text
VITE_SUPABASE_URL=https://bqezqvhdmqanxgzfvdag.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_JokBny3AnM8sCs75W3RsCA_TBN24fWl
VITE_LIFF_ID=<LIFF ID>
VITE_USE_MOCK_LINE=false
```

The current local `apps/liff-sb/.env.local` points at the local Docker stack;
switch it only after the cloud secrets and LINE channel are ready.
