-- Deleted residents must not remain as inaccessible lineage placeholders.

-- Clean up older soft-deleted endpoints first.
delete from public.animal_lineage l
using public.animals p, public.animals c
where l.parent_id = p.id and l.child_id = c.id
  and (p.deleted_at is not null or c.deleted_at is not null);

create or replace function public.lineage_for_animal(p_animal_id uuid)
returns table (
  edge_id uuid,
  relation text,
  accessible boolean,
  animal_id uuid,
  name text,
  species_label text,
  avatar_color text,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.animals a
    join public.household_members m on m.household_id = a.household_id
    where a.id = p_animal_id
      and a.deleted_at is null
      and m.user_id = auth.uid()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with edges as (
    select l.id as edge_id, 'parent'::text as relation, l.parent_id as other_id
    from public.animal_lineage l
    join public.animals p on p.id = l.parent_id
    join public.animals c on c.id = l.child_id
    where l.child_id = p_animal_id
      and p.deleted_at is null
      and c.deleted_at is null
    union all
    select l.id, 'child', l.child_id
    from public.animal_lineage l
    join public.animals p on p.id = l.parent_id
    join public.animals c on c.id = l.child_id
    where l.parent_id = p_animal_id
      and p.deleted_at is null
      and c.deleted_at is null
  ), resolved as (
    select e.edge_id, e.relation, e.other_id,
      exists (
        select 1
        from public.animals a
        join public.household_members m on m.household_id = a.household_id
        where a.id = e.other_id
          and a.deleted_at is null
          and m.user_id = auth.uid()
      ) as can_see
    from edges e
  )
  select
    r.edge_id,
    r.relation,
    r.can_see,
    case when r.can_see then a.id end,
    case when r.can_see then a.name end,
    case when r.can_see then a.species_label end,
    case when r.can_see then a.avatar_color end,
    case when r.can_see then a.status end
  from resolved r
  left join public.animals a on a.id = r.other_id
  order by r.relation, a.name;
end;
$$;

revoke execute on function public.lineage_for_animal(uuid) from public, anon, authenticated;
grant execute on function public.lineage_for_animal(uuid) to authenticated;
