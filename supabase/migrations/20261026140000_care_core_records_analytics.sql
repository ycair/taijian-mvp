-- Care Core 2B: richer record types and server-side analytics.

alter table public.records
  drop constraint if exists records_type_check;
alter table public.records
  add constraint records_type_check
  check (type in ('feeding','water','weight','length','poop','shed','activity','medical','note','custom'));

create index if not exists records_household_type_idx
  on public.records(household_id, type, occurred_at desc)
  where deleted_at is null;
create index if not exists records_animal_type_idx
  on public.records(animal_id, type, occurred_at desc)
  where deleted_at is null;

create or replace function public.record_analytics(
  p_household_id uuid,
  p_animal_id uuid default null,
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now(),
  p_timezone text default 'Asia/Taipei'
)
returns table (
  total integer,
  active_days integer,
  counts jsonb,
  measurements jsonb,
  attention jsonb,
  recent jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_animal_id is not null and not exists (
    select 1 from public.animals a
    where a.id = p_animal_id
      and a.household_id = p_household_id
      and a.deleted_at is null
  ) then
    raise exception 'animal is not in this household' using errcode = '42501';
  end if;

  if p_from >= p_to then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select
      r.*,
      to_char((r.occurred_at at time zone p_timezone)::date, 'YYYY-MM-DD') as date_key
    from public.records r
    where r.household_id = p_household_id
      and r.deleted_at is null
      and r.occurred_at >= p_from
      and r.occurred_at < p_to
      and (p_animal_id is null or r.animal_id = p_animal_id)
  ),
  grouped_counts as (
    select type, count(*)::int as count
    from filtered
    group by type
  ),
  measurement_points as (
    select
      type,
      case
        when type = 'custom' then coalesce(metadata->>'label', '自訂測量')
        when type = 'weight' then '體重'
        when type = 'length' then '身長'
        else type
      end as label,
      unit,
      date_key,
      value,
      occurred_at
    from filtered
    where p_animal_id is not null
      and type in ('weight', 'length', 'custom')
      and value is not null
  ),
  recent_records as (
    select
      r.id,
      r.household_id,
      r.animal_id,
      a.name as animal_name,
      r.type,
      r.occurred_at,
      r.value,
      r.unit,
      r.note,
      r.metadata,
      r.revision,
      r.created_by
    from filtered r
    join public.animals a on a.id = r.animal_id
    order by r.occurred_at desc
    limit 10
  )
  select
    (select count(*)::int from filtered) as total,
    (select count(distinct date_key)::int from filtered) as active_days,
    coalesce(
      (select jsonb_object_agg(type, count) from grouped_counts),
      '{}'::jsonb
    ) as counts,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', type,
            'label', label,
            'unit', unit,
            'date', date_key,
            'value', value,
            'occurred_at', occurred_at
          ) order by occurred_at
        )
        from measurement_points
      ),
      '[]'::jsonb
    ) as measurements,
    jsonb_build_object(
      'medical', (select count(*)::int from filtered where type = 'medical'),
      'refused_feedings', (
        select count(*)::int from filtered
        where type = 'feeding' and metadata @> '{"refused": true}'::jsonb
      ),
      'abnormal_activity', (
        select count(*)::int from filtered
        where type = 'activity'
          and coalesce(metadata->>'activityLevel', metadata->>'activity_level') in ('low', 'high')
      )
    ) as attention,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', id,
            'household_id', household_id,
            'animal_id', animal_id,
            'animal_name', animal_name,
            'type', type,
            'occurred_at', occurred_at,
            'value', value,
            'unit', unit,
            'note', note,
            'metadata', metadata,
            'revision', revision,
            'created_by', created_by
          ) order by occurred_at desc
        )
        from recent_records
      ),
      '[]'::jsonb
    ) as recent;
end;
$$;

revoke execute on function public.record_analytics(uuid, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_analytics(uuid, uuid, timestamptz, timestamptz, text) to authenticated;

comment on function public.record_analytics(uuid, uuid, timestamptz, timestamptz, text)
  is 'Household-scoped record summary and measurement series; callers must be household members.';
