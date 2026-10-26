-- Enable Supabase Realtime for the household-scoped care surfaces.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'animals', 'records', 'reminders', 'task_completions',
    'map_zones', 'animal_positions', 'shop_orders', 'points_ledger',
    'journal_entries', 'profile_subscriptions'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
