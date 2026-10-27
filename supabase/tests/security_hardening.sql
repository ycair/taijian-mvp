\set ON_ERROR_STOP on
do $$
declare
  table_name text;
begin
  foreach table_name in array array['journal_likes','proposal_votes'] loop
    if has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') then
      raise exception 'authenticated can select %', table_name;
    end if;
  end loop;
  foreach table_name in array array['journal_entries','proposals','map_zones','animal_positions','points_ledger','profile_subscriptions','shop_orders','shop_products','subscription_plans'] loop
    if has_table_privilege('authenticated', 'public.' || table_name, 'TRUNCATE') then
      raise exception 'authenticated can truncate %', table_name;
    end if;
    if not has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') then
      raise exception 'authenticated cannot select %', table_name;
    end if;
  end loop;
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='proposal_votes') then
    raise exception 'proposal_votes still published';
  end if;
end $$;
select 'security hardening OK' as result;
