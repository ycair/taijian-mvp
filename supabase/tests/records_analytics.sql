\set ON_ERROR_STOP on
begin;

insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000000501', 'Record Owner');

insert into public.households (id, name, owner_id) values
  ('00000000-0000-4000-8000-000000000511', 'Record home', '00000000-0000-4000-8000-000000000501');

insert into public.household_members (household_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000501', 'owner');

insert into public.animals (id, household_id, name, species, created_by, updated_by) values
  ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000511', '阿記錄', 'leopard-gecko', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501');

insert into public.records
  (id, household_id, animal_id, type, occurred_at, value, unit, metadata, source, created_by, updated_by)
values
  ('00000000-0000-4000-8000-000000000531', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000521', 'weight', '2026-10-01T02:00:00Z', 60, 'g', '{}', 'ios', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501'),
  ('00000000-0000-4000-8000-000000000532', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000521', 'weight', '2026-10-02T02:00:00Z', 62, 'g', '{}', 'ios', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501'),
  ('00000000-0000-4000-8000-000000000533', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000521', 'length', '2026-10-02T03:00:00Z', 30, 'cm', '{}', 'ios', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501'),
  ('00000000-0000-4000-8000-000000000534', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000521', 'feeding', '2026-10-03T02:00:00Z', null, null, '{"refused":true}', 'ios', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501'),
  ('00000000-0000-4000-8000-000000000535', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000521', 'activity', '2026-10-03T03:00:00Z', null, null, '{"activityLevel":"low"}', 'ios', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501'),
  ('00000000-0000-4000-8000-000000000536', '00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000521', 'medical', '2026-10-04T02:00:00Z', null, null, '{"medication":"藥"}', 'ios', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000501');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000501';

do $$
declare
  result record;
  forbidden_count int := 0;
begin
  select * into result from public.record_analytics(
    '00000000-0000-4000-8000-000000000511',
    '00000000-0000-4000-8000-000000000521',
    '2026-10-01T00:00:00Z',
    '2026-11-01T00:00:00Z',
    'Asia/Taipei'
  );

  if result.total <> 6 then
    raise exception 'unexpected total: %', result.total;
  end if;
  if result.active_days <> 4 then
    raise exception 'unexpected active days: %', result.active_days;
  end if;
  if (result.counts->>'weight')::int <> 2 then
    raise exception 'unexpected weight count: %', result.counts;
  end if;
  if (result.counts->>'length')::int <> 1 then
    raise exception 'unexpected length count: %', result.counts;
  end if;
  if jsonb_array_length(result.measurements) <> 3 then
    raise exception 'unexpected measurements: %', result.measurements;
  end if;
  if result.measurements->0->>'label' <> '體重' then
    raise exception 'unexpected first measurement: %', result.measurements;
  end if;
  if (result.attention->>'medical')::int <> 1
     or (result.attention->>'refused_feedings')::int <> 1
     or (result.attention->>'abnormal_activity')::int <> 1 then
    raise exception 'unexpected attention: %', result.attention;
  end if;
  if jsonb_array_length(result.recent) <> 6 then
    raise exception 'unexpected recent count: %', result.recent;
  end if;

  begin
    perform public.record_analytics(
      '00000000-0000-4000-8000-000000000999',
      null,
      '2026-10-01T00:00:00Z',
      '2026-11-01T00:00:00Z',
      'Asia/Taipei'
    );
  exception when insufficient_privilege then
    forbidden_count := 1;
  end;
  if forbidden_count <> 1 then
    raise exception 'unrelated household was not rejected';
  end if;
end $$;

select 'records analytics RPC OK' as result;
rollback;
