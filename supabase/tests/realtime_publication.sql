\set ON_ERROR_STOP on
do $$
declare
  n int;
begin
  select count(*) into n from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in ('animals','records','reminders','task_completions','map_zones','animal_positions','shop_orders','points_ledger','journal_entries','profile_subscriptions');
  if n < 10 then raise exception 'realtime publication incomplete (%)', n; end if;
end $$;
select 'realtime publication OK' as result;
