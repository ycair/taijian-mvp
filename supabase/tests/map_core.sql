\set ON_ERROR_STOP on
begin;
do $$
begin
  if to_regclass('public.map_zones') is null then raise exception 'map_zones missing'; end if;
  if to_regclass('public.animal_positions') is null then raise exception 'animal_positions missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.map_zones'::regclass) then raise exception 'map_zones RLS disabled'; end if;
  if has_table_privilege('anon', 'public.animal_positions', 'SELECT') then raise exception 'anon can read animal_positions'; end if;
end $$;
select 'map core schema OK' as result;
rollback;
