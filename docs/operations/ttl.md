# Firestore TTL runbook

Firestore native TTL deletes documents once their `expiresAt` timestamp is in
the past. The repositories already write `expiresAt` on the documents below, so
enabling TTL is an operational step, not a code change. Re-run this runbook per
environment (demo / staging / production).

## Policy

| Collection group | TTL field | Window / retention | Written by |
|---|---|---|---|
| `commands` | `expiresAt` | 24h after the command runs (`COMMAND_TTL_MS`) | `lib/idempotency.ts` |
| `rateLimits` | `expiresAt` | per-action fixed window, `expiresAt = windowStart + 2 × window`: 60s windows → 120s, 86 400s window → 48h | `lib/rateLimit.ts` |
| `loginRateLimits` | `expiresAt` | fixed 60s window, `expiresAt = windowStart + 1 × window` | `auth/loginRateLimit.ts` |
| `notificationLog` | `expiresAt` | 30d delivery history | `line/notifications` (Task 13/14) |

Notes:

- Windows are fixed, not sliding: a counter bucket starts at the first request
  in the window and resets when the window elapses. TTL only ever deletes a
  document once `expiresAt` is in the past; expiry is still enforced in code
  before a document is used. `commands` treats an expired row as a miss, and
  rate limits compare the stored `windowStart` against the current window.
- `rateLimits` stores one document per (uid, action hash). The global `command`
  budget and `record.create` both use a 60s window; `member.invite` uses an
  86 400s (24h) window. The document keeps `expiresAt = windowStart + 2 × window`
  so a bucket cannot be reused after it rolls over — 120s for the 60s windows,
  48h for the invite window.
- `loginRateLimits` stores one document per hashed IP with a **fixed 60s**
  window (`LOGIN_IP_WINDOW_MS`) and `expiresAt = windowStart + 1 × window`, so
  the document can disappear as soon as the window it belongs to is over.
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
of expiry and are billed as document deletes (one delete operation per deleted
document), not as writes.

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
