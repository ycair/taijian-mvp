-- Map 4A: shared household map zones and resident positions.

create table if not exists public.map_zones (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  x numeric(6,4) not null check (x >= 0 and x <= 1),
  y numeric(6,4) not null check (y >= 0 and y <= 1),
  w numeric(6,4) not null check (w > 0 and w <= 1),
  h numeric(6,4) not null check (h > 0 and h <= 1),
  color text not null default '#EEF4E8',
  sort_order int not null default 0,
  revision int not null default 0,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists map_zones_household_idx
  on public.map_zones(household_id, sort_order)
  where deleted_at is null;

create table if not exists public.animal_positions (
  animal_id uuid primary key references public.animals(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  zone_id uuid references public.map_zones(id) on delete set null,
  x numeric(6,4) not null default 0.5 check (x >= 0 and x <= 1),
  y numeric(6,4) not null default 0.5 check (y >= 0 and y <= 1),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index if not exists animal_positions_household_idx
  on public.animal_positions(household_id);

alter table public.map_zones enable row level security;
alter table public.animal_positions enable row level security;

drop policy if exists map_zones_read on public.map_zones;
create policy map_zones_read on public.map_zones
  for select to authenticated using (public.is_household_member(household_id));
drop policy if exists animal_positions_read on public.animal_positions;
create policy animal_positions_read on public.animal_positions
  for select to authenticated using (public.is_household_member(household_id));

grant select on public.map_zones, public.animal_positions to authenticated;
revoke insert, update, delete on public.map_zones, public.animal_positions from authenticated;
revoke all on public.map_zones, public.animal_positions from public, anon;
grant select, insert, update, delete on public.map_zones, public.animal_positions to service_role;

comment on table public.map_zones is 'Household map regions; clients use execute-command for writes.';
comment on table public.animal_positions is 'Normalized 0..1 resident positions on the household map.';
