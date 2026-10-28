# Journal comments and reports

## Scope

- Authenticated comments on link/public Journal entries.
- Comments are returned by `journal-public` with author display names only.
- Entry reporting; reports are stored for future moderation.
- No direct client table access; all reads/writes go through the function/commands.
- Follow/block and a moderation console remain deferred.

## Commands

- `journal.comment.create`
- `journal.comment.delete` (author only)
- `journal.report.create`

## UI

- Public Journal entry pages show comments.
- Logged-in users can post comments and report an entry.
- The browser must have a valid苔間 access token in local storage; otherwise the
  page remains read-only.

## Verification

- SQL table/RLS test.
- Cloud smoke: create/read comments and create a report.
