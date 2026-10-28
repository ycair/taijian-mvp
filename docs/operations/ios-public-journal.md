# iOS native public Journal

## Scope

The Flutter iOS app now owns the public Journal experience:

- `旅程` tab → `探索`: public feed.
- `全部 / 追蹤中` filter; followed authors use the server-side
  `journal-public?feed=1&following=1` query.
- Public entry detail page with photos, resident tags, like, follow, block,
  report, share, and comments.
- Comment composer writes through `journal.comment.create`.
- Admin users reach native `設定 → 檢舉管理` (`/moderation`) to list and resolve
  reports.

The LIFF web app remains the public fallback for people without the iOS app and
for LINE quick access. Netlify is not involved in iOS builds.

## Data flow

- Public reads: `GET /functions/v1/journal-public` with the same custom JWT as
  the rest of the iOS app.
- Social writes: `execute-command` (`journal.like`, `profile.follow`,
  `profile.block`, `journal.comment.create`, `journal.report.create`,
  `journal.report.list`, `journal.report.resolve`).
- Signed Storage URLs are created by the Edge Function; photos are not public
  bucket objects.
- Blocking still filters both the feed and direct public entry links server-side.

## Limitations

- Public resident detail inside iOS is still the web fallback; native resident
  public pages are a later batch.
- Comment-level report UI is not exposed yet, although the server and moderation
  console can handle comment reports.
- Public share links still land on the LIFF/web page for recipients without the
  app.

## Verification

- Flutter analyze and tests.
- Cloud smoke for follow-only feed: followed author appears, unfollowed author
  disappears.
- Profile iOS build installed and launched on the physical iPhone.
