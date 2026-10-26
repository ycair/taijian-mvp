\set ON_ERROR_STOP on
begin;
do $$
begin
  if to_regclass('public.proposals') is null then raise exception 'proposals missing'; end if;
  if to_regclass('public.proposal_votes') is null then raise exception 'proposal_votes missing'; end if;
  if not (select relrowsecurity from pg_class where oid='public.proposals'::regclass) then raise exception 'proposals RLS off'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='proposals_list') then raise exception 'proposals_list missing'; end if;
end $$;
select 'proposals schema OK' as result;
rollback;
