\set ON_ERROR_STOP on
begin;

insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000000001', 'House A'),
  ('00000000-0000-4000-8000-000000000002', 'House B');

insert into public.households (id, name, owner_id) values
  ('00000000-0000-4000-8000-000000000101', 'House A home', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000102', 'House B home', '00000000-0000-4000-8000-000000000002');

insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'owner'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000002', 'owner');

insert into public.animals (id, household_id, name, species, created_by, updated_by) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Parent', 'leopard-gecko', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'Child A', 'leopard-gecko', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000101', 'Child B', 'leopard-gecko', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');

insert into public.animal_lineage (id, parent_id, child_id, created_by) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001');

-- Simulate a completed transfer: Child A is now in House B, but the edge remains.
update public.animals
set household_id = '00000000-0000-4000-8000-000000000102'
where id = '00000000-0000-4000-8000-000000000202';

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';

do $$
declare
  inaccessible_count int;
  accessible_name text;
begin
  select count(*) into inaccessible_count
  from public.lineage_for_animal('00000000-0000-4000-8000-000000000201')
  where relation = 'child' and accessible = false and animal_id is null and name is null;
  if inaccessible_count <> 1 then
    raise exception 'transferred child was not masked (% rows)', inaccessible_count;
  end if;

  select name into accessible_name
  from public.lineage_for_animal('00000000-0000-4000-8000-000000000201')
  where relation = 'child' and accessible = true;
  if accessible_name is distinct from 'Child B' then
    raise exception 'accessible child was not returned';
  end if;
end $$;

select 'lineage privacy RPC OK' as result;
rollback;
