\set ON_ERROR_STOP on

do $$
declare
  species_count integer;
  col text;
begin
  if to_regclass('public.species') is null then
    raise exception 'species table is missing';
  end if;
  if to_regclass('public.animal_lineage') is null then
    raise exception 'animal_lineage table is missing';
  end if;
  if to_regclass('public.animal_transfers') is null then
    raise exception 'animal_transfers table is missing';
  end if;

  for col in
    select unnest(array['avatar_pattern', 'memorial_at', 'memorial_note'])
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'animals' and column_name = col
    ) then
      raise exception 'animals.% is missing', col;
    end if;
  end loop;

  select count(*) into species_count from public.species;
  if species_count < 13 then
    raise exception 'species seed is incomplete (% rows)', species_count;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'animal_lineage' and column_name = 'parent_id'
  ) then
    raise exception 'animal_lineage.parent_id is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'animal_transfers' and column_name = 'animal_ids'
  ) then
    raise exception 'animal_transfers.animal_ids is missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.species'::regclass) then
    raise exception 'species RLS is disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.animal_lineage'::regclass) then
    raise exception 'animal_lineage RLS is disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.animal_transfers'::regclass) then
    raise exception 'animal_transfers RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.animal_lineage', 'SELECT') then
    raise exception 'anon can read animal_lineage';
  end if;
  if has_table_privilege('authenticated', 'public.animal_transfers', 'SELECT') then
    raise exception 'authenticated can read animal_transfers';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lineage_for_animal'
  ) then
    raise exception 'lineage_for_animal RPC is missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_animal_transfers'
  ) then
    raise exception 'list_animal_transfers RPC is missing';
  end if;

  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'species'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'authenticated cannot read species';
  end if;
end $$;

select 'care core residents schema OK' as result;
