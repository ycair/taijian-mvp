# Journal photo core

## Scope

First Journal 3A slice:

- Household journey entries with title, body, date, and resident tags.
- Up to five photos per entry; one selected cover.
- Per-photo captions.
- Private Supabase Storage bucket (`journal-photos`) with household-path RLS.
- System share sheet for the entry text (no public link or external post).
- No stickers, freeform collage, crop editor, or journal photo quota yet.

## Server

Migration `20261026170000_journal_photo_core` adds:

- `journal_entries` with `photos jsonb`, `cover_path`, revision, soft delete.
- Private `journal-photos` bucket.
- Storage policies using the first path segment as the household ID.

Commands:

- `journal.create`
- `journal.update`
- `journal.delete`

Photos are uploaded by the client before the command. The server validates that
each path starts with `{householdId}/{journalId}/`, allows at most five photos,
and caps captions at 200 characters. Removing a photo on edit also deletes its
storage object after the command succeeds.

## Client

- `/journal` list, `/journal/new`, `/journal/:id`, `/journal/:id/edit`.
- Entry points from Today and Settings.
- `image_picker` for up to five library photos.
- Signed Storage URLs for private display.
- `share_plus` system share sheet for the text entry.

## Verification

- Journal Storage + command integration passed locally: upload, signed URL,
  create, list, update, delete, and object cleanup.
- Flutter analyzer clean; 88 tests passing.
- iOS build/install verification follows.
