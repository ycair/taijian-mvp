# Journal moderation console

## Access

- Web route: `/moderation` on the LIFF host (for example
  `https://heartfelt-sherbet-c689e3.netlify.app/moderation`).
- Requires a signed-in苔間 account with `profiles.is_admin = true`.
- The page is public to load, but every report read/write is checked by
  `execute-command`; non-admin accounts receive `FORBIDDEN`.

## Grant or revoke admin

Admin is intentionally not granted by any client command. Use SQL:

```sql
update public.profiles set is_admin = true
where id = '<profile uuid>';

update public.profiles set is_admin = false
where id = '<profile uuid>';
```

The current project owner is the only intended admin. Do not grant admin to
household members by default.

## Workflow

- Open `/moderation`, choose 待處理 / 已處理 / 已忽略.
- Inspect the entry or reported comment, then mark 已處理 or 忽略.
- Resolving writes `status`, `reviewed_at`, and `reviewed_by`; it does not delete
  content automatically.
- Reports are limited to 100 per status query. Older reports stay in the
  database for manual SQL review.

## Verification

- `journal.report.list` and `journal.report.resolve` reject non-admin profiles.
- Admin can list an open report, resolve it, and see it under 已處理.
- Direct table access remains revoked.
