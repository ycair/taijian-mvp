# Account deletion and admin retry

`deleteAccount` (callable) deletes the caller's account:

- an owned household with other members blocks the whole operation before
  anything changes;
- sole-owner households are soft-deleted, their active invites revoked, and a
  `household.delete` audit entry is written in the household timeline;
- the profile stays as a tombstone (`deletedAt`) so the account audit trail and
  `lineLogin` refusal survive;
- LINE mappings become `status: deleted`, and the Firebase Auth user (plus its
  refresh tokens) is removed.

## User-facing guards

- The ID token must carry an `auth_time` no older than five minutes
  (`RECENT_AUTH_MAX_AGE_SECONDS`). Clients must call
  `reauthenticateWith...`-equivalent before invoking the callable.
- One deletion attempt per UID per hour (`account.delete` bucket). A retry after
  the tombstone exists is free: it is a no-op, not a new deletion.

## Half-deleted account

A crash can leave the profile/membership/household in place after the Auth user
was removed (or the reverse). Finish it with the admin callable:

1. Grant the operator a custom claim, then have them refresh their token:

   ```js
   await getAuth().setCustomUserClaims(operatorUid, { admin: true });
   ```

2. Call `adminRetryDeleteAccount` with `{ "uid": "<uid>" }`. It is restricted to
   tokens with that claim and bypasses the hourly limit.
3. The routine is idempotent: memberships resolve from
   `users/{uid}.householdIds`, the original `deletedAt` timestamps are kept, and
   the account audit log gets exactly one `account.delete` entry.

```bash
firebase functions:log --only adminRetryDeleteAccount
```

Never hand-edit `deletedAt` or run unbounded recursive deletes by hand; the
`purgeDeleted` job removes soft-deleted households and their children after 30
days.
