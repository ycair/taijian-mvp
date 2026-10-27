\set ON_ERROR_STOP on
begin;
insert into public.profiles (id, display_name) values ('00000000-0000-4000-8000-000000000601', 'Lineage delete');
insert into public.households (id, name, owner_id) values ('00000000-0000-4000-8000-000000000611', 'Delete household', '00000000-0000-4000-8000-000000000601');
insert into public.household_members (household_id, user_id, role) values ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000601', 'owner');
insert into public.animals (id, household_id, name, species, deleted_at, created_by, updated_by) values
  ('00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000611', 'Parent', 'leopard-gecko', null, '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000601'),
  ('00000000-0000-4000-8000-000000000622', '00000000-0000-4000-8000-000000000611', 'Deleted child', 'leopard-gecko', now(), '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000601'),
  ('00000000-0000-4000-8000-000000000623', '00000000-0000-4000-8000-000000000611', 'Live child', 'leopard-gecko', null, '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000601');
insert into public.animal_lineage (parent_id, child_id, created_by) values
  ('00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000622', '00000000-0000-4000-8000-000000000601'),
  ('00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000623', '00000000-0000-4000-8000-000000000601');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000601';
do $$
begin
  if exists (select 1 from public.lineage_for_animal('00000000-0000-4000-8000-000000000621') where name = 'Deleted child') then
    raise exception 'deleted child is still returned';
  end if;
  if (select count(*) from public.lineage_for_animal('00000000-0000-4000-8000-000000000621') where relation = 'child') <> 1 then
    raise exception 'deleted child edge was not removed';
  end if;
  if not exists (select 1 from public.lineage_for_animal('00000000-0000-4000-8000-000000000621') where name = 'Live child') then
    raise exception 'live child missing';
  end if;
end $$;
select 'lineage delete fix OK' as result;
rollback;
