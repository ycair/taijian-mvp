\set ON_ERROR_STOP on
begin;
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='journal_entries' and column_name='visibility') then
    raise exception 'journal visibility missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='journal_public_feed_idx') then
    raise exception 'journal public feed index missing';
  end if;
end $$;
select 'journal visibility schema OK' as result;
rollback;
