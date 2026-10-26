# Care Core 2B operations

## Scope

2B completes the care-record surface and adds in-app analytics:

- Add, edit, soft-delete records with owner/creator permissions.
- New `length` type plus type-specific metadata:
  - feeding: food, refused
  - activity: normal/low/high
  - medical: medication, dosage
  - custom: measurement label
- Household timeline with date-range filtering and edit/delete actions.
- Household analytics: total records, active days, care-frequency counts,
  refusal/abnormal-activity/medical attention, recent records.
- Resident analytics: weight/length/custom measurement chart, frequency counts,
  attention summary, recent history, date-range selection.
- LIFF keeps basic creation/history; it only adds `length` display labels.

## Server

- Migration `20261026140000_care_core_records_analytics`.
- `record.create` now validates type, time, value, metadata, and active animal.
- New `record.update` and `record.delete`:
  - owner can modify any record;
  - caretaker can modify only `created_by = auth.uid()`;
  - revision conflict and audit log;
  - memorial/archived records are read-only;
  - delete is a soft delete.
- New RPC:

```sql
public.record_analytics(
  p_household_id uuid,
  p_animal_id uuid default null,
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now(),
  p_timezone text default 'Asia/Taipei'
)
returns (
  total integer, active_days integer, counts jsonb,
  measurements jsonb, attention jsonb, recent jsonb
)
```

The function checks household membership and optional animal ownership before
returning data. It is granted only to `authenticated`.

## Client

- Flutter `RecordAnalytics`/`RecordMeasurementPoint` models.
- `recordAnalyticsProvider` uses the RPC in Supabase mode and the local record
  cache in mock mode.
- `CustomPainter` chart, no chart package dependency.
- Date presets: 7/30/90 days plus custom range.
- Routes: `/records/analytics` and `/animals/:id/analytics`.

## Verification

- Flutter: `flutter analyze` clean; 81 tests passing.
- Deno: 22 auth/session tests passing.
- LIFF: 7 tests passing; `tsc --noEmit` clean.
- SQL: 2A schema, lineage, transfers, and 2B analytics RPC assertions.
- Cloud smoke: guest → household → animal → weight/length/refused feeding →
  update → analytics RPC → delete → confirmed account deletion.
- Cloud migration applied; `execute-command` v8 deployed.
- iOS Profile built, installed, and launched on the physical iPhone.

## Deferred

CSV/PDF/image export and external telemetry are not part of 2B. Photos, journal,
map/dens, points, push/APNs, Widgets, TestFlight/App Store, and real IAP remain
deferred.
