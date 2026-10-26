# Journal Social — J1/J2/J3

**Status:** Design + J1 implementation
**Date:** 2026-10-26

## Goal

Turn the photo journal into a family-first social surface, with explicit
per-entry privacy. It must never leak private household photos into a public
feed accidentally.

## Visibility model

Every `journal_entries` row has:

```sql
visibility text not null default 'household'
  check (visibility in ('household','link','public')),
share_token text unique,
published_at timestamptz
```

- **J1 household**: current behavior; only household members can read.
- **J2 link**: anyone with the unlisted token can read one entry; it is not in
  any feed or search result.
- **J3 public**: readable by anyone and eligible for the public feed; requires
  an explicit confirmation and a public author display name.
- Changing to `household` clears `share_token`/`published_at` and invalidates
  existing links.
- Photos remain in the private bucket. Public/link reads get short-lived signed
  URLs from a server-side function; storage is never made public.

## Public read path

Add one Edge Function:

```text
GET /functions/v1/journal-public?token=<share_token>
GET /functions/v1/journal-public?feed=1&limit=20&before=<cursor>
```

- J2 token lookup only returns the matching entry.
- J3 feed returns only `visibility='public'`, non-deleted entries.
- The function uses the service role to read the row and create short-lived
  signed photo URLs. It returns only:
  - title, body, date, cover URL, photo URLs/captions
  - author display name/avatar (no UID, household ID, or private resident data)
- It must never accept arbitrary storage paths.

## J3 social surface

First public version:

- public feed of public entries, newest first
- entry detail with photo carousel/captions
- author display name and avatar
- share link
- likes and comments are a follow-up; if added, require LINE auth, rate limits,
  report/block, and comment deletion rights.

Moderation/reporting is required before public feed becomes generally available.
The demo can launch with public entries and no comments, but not with unmoderated
comments.

## iOS UX

- Journal editor: visibility selector
  - 家庭可見（預設）
  - 僅連結可見
  - 公開貼文（明確提示公開範圍）
- Detail: visibility badge; J2 shows copy-link; J3 shows public-link/share.
- Feed: family feed remains default. Public feed is a separate surface.
- Navigation: Today / Residents / Journal / Shop / Settings. Records move under
  Residents.

## Rollout

1. J1 family feed + navigation (implemented).
2. J2 visibility/share token + Edge Function read-only link page.
3. J3 public feed and author profile, then reactions/comments with moderation.

## Non-goals for first public slice

- algorithmic ranking
- follow graph
- direct messages
- unmoderated comments
- public storage bucket
