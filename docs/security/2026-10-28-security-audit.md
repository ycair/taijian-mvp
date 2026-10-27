# Security audit — 2026-10-28

## Scope

Focused source/RLS audit of the newly added social and public-resident surfaces:

- `journal_entries`, `journal_likes`, `proposals`, `proposal_votes`
- `animals.record_visibility` / public tokens
- `journal-public` and `resident-public` Edge Functions
- Supabase Storage policies and Realtime publication
- command authorization for likes, proposals, visibility, map/moves

## Findings fixed

### Low — unnecessary authenticated access to social join rows

`journal_likes` and `proposal_votes` had Supabase default table privileges and
SELECT policies (`using(true)`), so any authenticated account could enumerate
other profiles' IDs and vote/like metadata through PostgREST, even though the app
only consumes aggregate data through security-definer RPCs/functions.

Fix:

- Revoke all default `TRUNCATE`, `REFERENCES`, and `TRIGGER` grants from new
  client tables.
- Revoke direct SELECT on `journal_likes` and `proposal_votes`.
- Remove `proposal_votes` from the Realtime publication and client subscription.
- Keep aggregate access through `proposals_list()` and public journal hydration.

Verification: both direct REST reads return 401; proposals RPC and public journal
likes still pass cloud smoke tests.

## Confirmed controls (reviewed scope)

- Resident public pages are opt-in, owner-only, token-gated, and read-only.
- Public tokens are cleared when visibility returns to private.
- Public lineage masks private relatives; no household/UID data is returned.
- Public photos remain in a private bucket and are exposed only through
  short-lived signed URLs.
- Journal likes are one per profile and require a link/public entry.
- No high or critical issue was found in this reviewed scope.

## Residual / needs future work

- Public content has no report/block/comment moderation UI yet.
- Public endpoints have no dedicated rate limiting beyond token entropy.
- Public capability URLs can leak through sharing/logs; owners should treat them
  as bearer links.
- A full repository-wide audit (auth, all old migrations, deployment, native app)
  remains a separate scope.
