-- Care Core 2A: species, resident profile extensions, lineage, and transfers.

create table if not exists public.species (
  id text primary key,
  name text not null,
  kingdom text not null,
  category text not null,
  default_color text not null default '#7C9A76',
  default_pattern text not null default 'solid',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.species (id, name, kingdom, category, default_color, default_pattern, sort_order)
values
  ('leopard-gecko', '豹紋守宮', 'animalia', 'reptile', '#C9A66B', 'spots', 10),
  ('african-fat-tail-gecko', '肥尾守宮', 'animalia', 'reptile', '#B89C7A', 'solid', 20),
  ('corn-snake', '玉米蛇', 'animalia', 'reptile', '#D98B5F', 'stripes', 30),
  ('ball-python', '球蟒', 'animalia', 'reptile', '#8B6B4A', 'spots', 40),
  ('green-horned-frog', '綠角蛙', 'animalia', 'amphibian', '#7C9A76', 'spots', 50),
  ('bearded-dragon', '鬃獅蜥', 'animalia', 'reptile', '#D8A05A', 'gradient', 60),
  ('veiled-chameleon', '變色龍', 'animalia', 'reptile', '#6F9B6B', 'gradient', 70),
  ('blue-tongue-skink', '藍舌蜥', 'animalia', 'reptile', '#8C7B6B', 'stripes', 80),
  ('red-eared-slider', '巴西龜', 'animalia', 'reptile', '#6E8F72', 'solid', 90),
  ('sulcata-tortoise', '蘇卡達陸龜', 'animalia', 'reptile', '#B59A6A', 'solid', 100),
  ('sugar-glider', '蜜袋鼯', 'animalia', 'mammal', '#A7A29A', 'solid', 110),
  ('hedgehog', '刺蝟', 'animalia', 'mammal', '#8B7A6A', 'spots', 120),
  ('other', '其他', 'other', 'other', '#7C9A76', 'solid', 999)
on conflict (id) do update set
  name = excluded.name,
  kingdom = excluded.kingdom,
  category = excluded.category,
  default_color = excluded.default_color,
  default_pattern = excluded.default_pattern,
  sort_order = excluded.sort_order;

alter table public.animals
  add column if not exists avatar_pattern text not null default 'solid'
    check (avatar_pattern in ('solid', 'spots', 'stripes', 'gradient')),
  add column if not exists memorial_at timestamptz,
  add column if not exists memorial_note text;

create table if not exists public.animal_lineage (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.animals(id) on delete cascade,
  child_id uuid not null references public.animals(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);
create index if not exists animal_lineage_parent_idx on public.animal_lineage(parent_id);
create index if not exists animal_lineage_child_idx on public.animal_lineage(child_id);

create table if not exists public.animal_transfers (
  id uuid primary key default gen_random_uuid(),
  source_household_id uuid not null references public.households(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete cascade,
  target_household_id uuid references public.households(id) on delete cascade,
  animal_ids uuid[] not null,
  transfer_type text not null check (transfer_type in ('own', 'other')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  note text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null,
  check (cardinality(animal_ids) > 0),
  check (transfer_type <> 'own' or target_household_id is not null),
  check (transfer_type <> 'other' or target_user_id is not null)
);
create index if not exists animal_transfers_target_idx
  on public.animal_transfers(target_user_id, status);
create index if not exists animal_transfers_source_idx
  on public.animal_transfers(source_household_id, status);
create index if not exists animal_transfers_animals_idx
  on public.animal_transfers using gin(animal_ids);

alter table public.species enable row level security;
alter table public.animal_lineage enable row level security;
alter table public.animal_transfers enable row level security;

drop policy if exists species_select_authenticated on public.species;
create policy species_select_authenticated on public.species
  for select to authenticated
  using (active = true);

grant select on public.species to authenticated;
revoke all on public.species from public, anon, authenticated;
grant select on public.species to authenticated;

revoke all on public.animal_lineage, public.animal_transfers from public, anon, authenticated;
grant select, insert, update, delete on public.animal_lineage, public.animal_transfers to service_role;

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
    where l.child_id = p_animal_id
    union all
    select l.id, 'child', l.child_id
    from public.animal_lineage l
    where l.parent_id = p_animal_id
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

create or replace function public.list_animal_transfers()
returns table (
  id uuid,
  direction text,
  transfer_type text,
  status text,
  animal_names text[],
  source_household_name text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select t.*,
      case when t.target_user_id = auth.uid() then 'incoming' else 'outgoing' end as direction
    from public.animal_transfers t
    where t.target_user_id = auth.uid()
       or exists (
         select 1 from public.household_members m
         where m.household_id = t.source_household_id
           and m.user_id = auth.uid()
           and m.role = 'owner'
       )
  )
  select
    m.id,
    m.direction,
    m.transfer_type,
    m.status,
    coalesce(array_agg(a.name order by a.name) filter (where a.id is not null), '{}') as animal_names,
    h.name,
    m.expires_at,
    m.created_at
  from mine m
  join public.households h on h.id = m.source_household_id
  left join public.animals a on a.id = any(m.animal_ids)
  group by m.id, m.direction, m.transfer_type, m.status, h.name, m.expires_at, m.created_at
  order by m.created_at desc;
$$;

revoke execute on function public.list_animal_transfers() from public, anon, authenticated;
grant execute on function public.list_animal_transfers() to authenticated;

comment on table public.species is 'Read-only demo species catalog for resident profiles.';
comment on table public.animal_lineage is 'Lineage edges survive transfers; clients use lineage_for_animal for privacy.';
comment on table public.animal_transfers is 'Atomic resident ownership transfer requests.';
