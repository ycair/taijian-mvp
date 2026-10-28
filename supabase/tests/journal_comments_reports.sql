\set ON_ERROR_STOP on
begin;
do $$
begin
  if to_regclass('public.journal_comments') is null then raise exception 'journal_comments missing'; end if;
  if to_regclass('public.journal_reports') is null then raise exception 'journal_reports missing'; end if;
  if has_table_privilege('authenticated','public.journal_comments','SELECT') then raise exception 'comments direct read open'; end if;
  if has_table_privilege('authenticated','public.journal_reports','SELECT') then raise exception 'reports direct read open'; end if;
end $$;
select 'journal comments/reports schema OK' as result;
rollback;
