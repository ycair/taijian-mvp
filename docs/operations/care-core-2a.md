# Care Core 2A operations

## Cloud surface

- Migration `20261026120000_care_core_residents`: species catalog, resident
  profile fields, lineage, transfer history, RPCs.
- Migration `20261026130000_care_core_advisors`: covering indexes and explicit
  deny policies for direct lineage/transfer reads.
- `execute-command` v7 adds `animal.update/archive/delete/memorialize`,
  `lineage.add/remove`, and `transfer.create/accept/decline/cancel`.

All mutations are owner-checked where the 2A spec requires it and remain
server-authoritative through `execute-command`. Direct client access to lineage
and transfer tables is revoked; reads use the two privacy RPCs.

## Verification

- Local SQL: `care_core_residents.sql`, `lineage_rpc.sql`, `transfers_rpc.sql`.
- Deno: 22 auth/session tests.
- Flutter: `flutter analyze` clean, 75 tests.
- LIFF: 7 Vitest tests and `tsc --noEmit`.
- Cloud smoke: guest login → household → resident profile update → lineage →
  own-household transfer → memorial → record rejection. The isolated smoke
  profile and households were cleaned up afterward.
- Physical iPhone Profile install at `app.taijian.mobile` verified launching
  against the cloud project.

## Deferred

Photos, journal/media, map/dens, points cost, push/APNs, Widgets, App Store,
TestFlight, and real IAP are not part of 2A. A local Profile install is the
current iOS delivery path.
