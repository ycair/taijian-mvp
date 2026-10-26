# Supabase Realtime

`RealtimeSync` opens a websocket for the signed-in household and profile. It
subscribes to Postgres changes for:

- animals, records, reminders, task_completions
- map_zones, animal_positions
- shop_orders, points_ledger, profile_subscriptions
- journal_entries

Events are debounced (250 ms) and invalidate the corresponding Riverpod
providers. `SupabaseReadStore` polling remains the fallback for reconnects,
background resumes, and unsupported clients.

The migration `20261027110000_realtime_publication` adds the tables to the
`supabase_realtime` publication. RLS is still enforced by the JWT set on the
Realtime client. No paid Realtime add-on is used.
