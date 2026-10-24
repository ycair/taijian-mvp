# Firestore TTL runbook

Firestore native TTL deletes documents once their `expiresAt` timestamp is in
the past. The repositories already write `expiresAt` on the documents below, so
enabling TTL is an operational step, not a code change. Re-run this runbook per
environment (demo / staging / production).

## Policy

| Collection group | TTL field | Intended retention | Written by |
|---|---|---|---|
| `commands` | `expiresAt` | 24h after the command runs | `lib/idempotency.ts` (`COMMAND_TTL_MS`) |
| `rateLimits` | `expiresAt` | 1h sliding window bucket | `lib/rateLimit.ts` |
| `loginRateLimits` | `expiresAt` | 1h sliding window bucket | `auth/loginRateLimit.ts` |
| `notificationLog` | `expiresAt` | 30d delivery history | `line/notifications` (Task 13/14) |

Notes:

- TTL only ever deletes documents. Expiry is still enforced in code before a
  document is used: `commands` checks `expiresAt` and treats an expired row as a
  miss, rate limits compare the stored window, and duplicate LINE deliveries are
  filtered before `notificationLog` is read.
- `rateLimits` and `loginRateLimits` store `expiresAt = windowStart + 2 × window`
  so a counter bucket can never be reused after it rolls over. The 1h figure is
  the logical window; the physical retention is at most twice that.
- `invites.expiresAt` is **not** a TTL field. Expired invites are kept as an
  audit trail and rejected by `status`/`expiresAt` checks in the invite handler.
- The Firestore emulator ignores TTL policies. No test depends on TTL; the
  rules and integration suites assert on explicit fields instead.

## Enable a policy

TTL is configured per collection group and per project. `--collection-group`
matches every collection with that name (there are no nested collections with
these names today, but TTL covers them if they appear).

```bash
PROJECT_ID=taijian-prod   # demo-taijian, taijian-staging, taijian-prod

gcloud firestore fields ttls update expiresAt \
  --collection-group=commands \
  --enable-ttl \
  --project="$PROJECT_ID"

gcloud firestore fields ttls update expiresAt \
  --collection-group=rateLimits \
  --enable-ttl \
  --project="$PROJECT_ID"

gcloud firestore fields ttls update expiresAt \
  --collection-group=loginRateLimits \
  --enable-ttl \
  --project="$PROJECT_ID"

gcloud firestore fields ttls update expiresAt \
  --collection-group=notificationLog \
  --enable-ttl \
  --project="$PROJECT_ID"
```

Requirements:

- `gcloud` authenticated as a principal with `roles/datastore.owner` (or
  `roles/firebase.admin`) on the target project. Use interactive
  `gcloud auth login` or workload identity; never commit service-account keys.
- Firestore Native mode (not Datastore mode).
- The field must be a timestamp. Documents without the field are ignored.

## Verify

```bash
gcloud firestore fields ttls list --project="$PROJECT_ID"

gcloud firestore fields ttls describe expiresAt \
  --collection-group=commands \
  --project="$PROJECT_ID"
```

Each row should report `state: ACTIVE`. Deletions begin within roughly 24 hours
of expiry and are not billed as writes.

## Disable / re-enable

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=commands \
  --no-enable-ttl \
  --project="$PROJECT_ID"
```

Disabling stops future deletions; already-deleted documents are not restored.
Re-enabling with the command above resumes deletion of everything already past
`expiresAt`.

## Rollback

If TTL deletes documents that must be kept (for example, an audit need for
`commands`), disable the policy for that collection group immediately, then
raise the retention in code and backfill `expiresAt` before re-enabling. The
household and account audit trails live in `auditLogs`, which has no
`expiresAt` field and must never be given a TTL policy.
