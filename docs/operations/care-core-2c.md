# Care Core 2C operations

## Scope

2C adds reminder delivery and a weekly care overview while keeping remote push
and Widgets deferred:

- iOS local notifications for daily, weekly, and every-N-days reminders.
- A device-level notification toggle in Settings; permission is requested only
  when the user enables notifications.
- Automatic rescheduling when reminders, residents, timezone, or the selected
  household change.
- Weekly overview (`/reminders/weekly`) with seven days of scheduled care and
  completion status.
- No APNs/FCM remote push and no Widget.

## Notification behavior

- Daily and weekly schedules use native repeating calendar notifications.
- Every-N-days schedules materialize the next occurrences, capped by the
  planner's notification budget.
- Notifications are scheduled only for the currently selected household and
  active residents.
- Local notification preferences are device-local in SharedPreferences.
- Denying the iOS permission leaves the setting off and shows a snackbar.
- Notification taps open the app; deep-link routing is intentionally deferred.

## Files

- `apps/mobile/lib/features/reminders/notification_plan.dart` — pure schedule planner.
- `apps/mobile/lib/features/reminders/notification_service.dart` — plugin, permission, preferences.
- `apps/mobile/lib/app/notification_sync.dart` — provider-driven rescheduling.
- `apps/mobile/lib/features/reminders/weekly_overview_screen.dart` — seven-day view.

## Verification

- Flutter analyzer clean; planner/weekly widget tests.
- iOS Profile build and physical-device launch.
- Existing Deno/Supabase tests are unaffected.

## Deferred

Remote push/APNs, notification actions, deep links, Widgets, TestFlight/App Store,
and real IAP remain deferred.
