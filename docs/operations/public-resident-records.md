# Public resident records

## Policy

- Every resident starts with `record_visibility = 'private'`.
- Only a household owner can toggle `animal.setRecordVisibility`.
- Public means anyone with the unguessable `/r/<public_token>` link can read
  the resident summary, public lineage relatives, and all care records.
- Public records are read-only. No household ID, profile UID, or private
  relative details are returned.
- The token is cleared when visibility returns to private; old links stop working.
- Public residents can be reached from public Journal tags and public lineage
  links. Private relatives are shown only as hidden placeholders.

## Surface

- `resident-public` Edge Function:
  - `GET /resident-public?token=<token>`
  - returns safe summary, records, and public immediate lineage.
- LIFF page: `/r/<token>`.
- iOS resident detail: owner-only switch and copy-link action.

## Verification

- SQL: `public_resident_records.sql`.
- Cloud smoke: public/private record visibility and relative masking.
