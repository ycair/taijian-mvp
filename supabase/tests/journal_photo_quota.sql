\set ON_ERROR_STOP on
begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscription_plans' and column_name='photo_quota') then raise exception 'photo_quota missing'; end if;
  if to_regclass('public.journal_photo_usage') is null then raise exception 'usage missing'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='journal_photo_quota') then raise exception 'quota rpc missing'; end if;
end $$;
select 'journal photo quota schema OK' as result;
rollback;
