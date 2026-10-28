\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regclass('public.profile_follows') is null then raise exception 'follows missing'; end if;
  if to_regclass('public.profile_blocks') is null then raise exception 'blocks missing'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('profile_follows','profile_blocks') and grantee in ('anon','authenticated')) then raise exception 'direct grants present'; end if;
end $$;
select 'follow/block schema OK' as result;
rollback;
