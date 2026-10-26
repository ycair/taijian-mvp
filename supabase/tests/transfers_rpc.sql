\set ON_ERROR_STOP on
begin;

insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000000401', 'Source Owner'),
  ('00000000-0000-4000-8000-000000000402', 'Target Owner'),
  ('00000000-0000-4000-8000-000000000403', 'Unrelated');

insert into public.households (id, name, owner_id) values
  ('00000000-0000-4000-8000-000000000411', 'Source home', '00000000-0000-4000-8000-000000000401'),
  ('00000000-0000-4000-8000-000000000412', 'Target home', '00000000-0000-4000-8000-000000000402');

insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-000000000401', 'owner'),
  ('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-000000000402', 'owner');

insert into public.animals (id, household_id, name, species, created_by, updated_by) values
  ('00000000-0000-4000-8000-000000000421', '00000000-0000-4000-8000-000000000411', '轉移中的居民', 'leopard-gecko', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000401');

insert into public.animal_transfers
  (id, source_household_id, target_user_id, animal_ids, transfer_type, status, created_by, expires_at)
values
  ('00000000-0000-4000-8000-000000000431', '00000000-0000-4000-8000-000000000411',
   '00000000-0000-4000-8000-000000000402', array['00000000-0000-4000-8000-000000000421']::uuid[],
   'other', 'pending', '00000000-0000-4000-8000-000000000401', now() + interval '7 days');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000402';

do $$
declare
  incoming record;
begin
  select * into incoming from public.list_animal_transfers();
  if incoming.direction <> 'incoming' then
    raise exception 'target did not receive incoming transfer';
  end if;
  if incoming.source_household_name <> 'Source home' then
    raise exception 'source household name missing';
  end if;
  if incoming.animal_names <> array['轉移中的居民'] then
    raise exception 'animal names missing';
  end if;
end $$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000401';
do $$
declare
  outgoing record;
begin
  select * into outgoing from public.list_animal_transfers();
  if outgoing.direction <> 'outgoing' then
    raise exception 'source did not receive outgoing transfer';
  end if;
end $$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000403';
do $$
begin
  if exists (select 1 from public.list_animal_transfers()) then
    raise exception 'unrelated user can see transfer';
  end if;
end $$;

select 'transfer list RPC OK' as result;
rollback;
