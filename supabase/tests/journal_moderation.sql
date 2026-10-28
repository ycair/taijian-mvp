\set ON_ERROR_STOP on
begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_admin') then raise exception 'is_admin missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='journal_reports' and column_name='reviewed_at') then raise exception 'reviewed_at missing'; end if;
end $$;
select 'moderation schema OK' as result;
rollback;
