# Public Journal follows and blocks

## Behaviour

- Signed-in readers can follow or unfollow the author of a public Journal entry.
- Blocking an author is immediate and hides that author from the public feed and
  from direct public Journal links for that reader.
- Blocking removes follow relationships in both directions.
- Following is stored now and is available for a future "following" feed; it
  does not change the current public feed order.
- Authors are identified to the public reader by their profile UUID returned by
  `journal-public`. No email, LINE ID, private household, or private profile data
  is exposed.

## Data and commands

- `profile_follows(follower_id, following_id)`
- `profile_blocks(blocker_id, blocked_id)`
- `profile.follow` toggles a follow.
- `profile.block` toggles a block; blocking also removes follows both ways.

Tables have RLS enabled and all direct client grants revoked. Access is through
the server-authoritative command function only.

## Verification

- `journal-public` filters blocked authors when a valid viewer token is sent.
- Cloud smoke with two guest accounts: follow, block, feed exclusion, unblock,
  feed restoration.
