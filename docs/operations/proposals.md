# Proposals and upvotes

## Scope

A lightweight authenticated proposal board:

- Create a proposal with title and body.
- One vote per profile; the vote button toggles.
- Public author display name, vote count, status and timestamp.
- Status values: `open`, `in_progress`, `adopted`, `completed`.
- Status administration is deferred; seed/change status from SQL for now.

## Server

Migration `20261027120000_proposals`:

- `proposals` and `proposal_votes`.
- RLS reads for authenticated users; command-only writes.
- `proposals_list()` security-definer RPC returns author/vote summary.
- Realtime publication for both tables.

Commands:

- `proposal.create`
- `proposal.vote`

## UI

- Settings → 提案與附議.
- Supports empty state, create dialog, vote/unvote, pull-to-refresh.
- Realtime invalidation refreshes the board across devices.

## Deferred

Admin moderation/status console, comments, proposal editing, and LIFF board.
