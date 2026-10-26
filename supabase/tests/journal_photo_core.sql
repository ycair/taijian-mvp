\set ON_ERROR_STOP on
begin;
do $$
begin
  if to_regclass('public.journal_entries') is null then raise exception 'journal_entries missing'; end if;
  if not exists (select 1 from storage.buckets where id = 'journal-photos' and public = false) then
    raise exception 'journal-photos bucket missing or public';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.journal_entries'::regclass) then
    raise exception 'journal_entries RLS disabled';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'journal_photos_select') then
    raise exception 'journal storage policy missing';
  end if;
  if has_table_privilege('anon', 'public.journal_entries', 'SELECT') then
    raise exception 'anon can read journal_entries';
  end if;
end $$;
select 'journal photo schema OK' as result;
rollback;
