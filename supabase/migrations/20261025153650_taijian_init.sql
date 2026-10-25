-- 苔間 demo schema for Supabase
-- Custom JWT auth: profiles.id = JWT sub, role = authenticated.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key,
  line_sub text unique,
  display_name text not null,
  avatar_url text,
  timezone text not null default 'Asia/Taipei',
  default_household_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id),
  timezone text not null default 'Asia/Taipei',
  owner_count int not null default 1,
  member_count int not null default 1,
  revision int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'caretaker')),
  joined_at timestamptz not null default now(),
  invited_by uuid,
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members(user_id);

create table if not exists public.animals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  species text not null,
  species_label text,
  morph text,
  sex text not null default 'unknown' check (sex in ('male', 'female', 'unknown')),
  birth_date date,
  adoption_date date,
  avatar_color text not null default '#7C9A76',
  notes text,
  status text not null default 'active' check (status in ('active', 'memorial', 'archived')),
  revision int not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_changed_fields text[] not null default '{}'
);

create index if not exists animals_household_idx
  on public.animals(household_id, status, name);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  animal_id uuid not null references public.animals(id) on delete cascade,
  type text not null check (type in ('feeding','water','weight','poop','shed','activity','medical','note','custom')),
  occurred_at timestamptz not null,
  value numeric,
  unit text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  source text not null default 'liff',
  source_event_id text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  revision int not null default 0,
  deleted_at timestamptz,
  last_changed_fields text[] not null default '{}'
);

create index if not exists records_household_idx
  on public.records(household_id, occurred_at desc);
create index if not exists records_animal_idx
  on public.records(animal_id, occurred_at desc);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  animal_id uuid not null references public.animals(id) on delete cascade,
  title text not null,
  type text not null default 'feeding',
  schedule jsonb not null,
  timezone text not null default 'Asia/Taipei',
  enabled boolean not null default true,
  next_due_at timestamptz,
  last_completed_at timestamptz,
  revision int not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists reminders_due_idx
  on public.reminders(enabled, next_due_at);
create index if not exists reminders_household_idx
  on public.reminders(household_id, enabled) where deleted_at is null;

create table if not exists public.task_completions (
  id text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  animal_id uuid not null,
  reminder_id uuid not null,
  due_date date not null,
  completed_at timestamptz not null default now(),
  completed_by uuid not null,
  completed_by_name text,
  source text not null default 'liff'
);

create index if not exists task_completions_household_idx
  on public.task_completions(household_id, due_date);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  role text not null default 'caretaker' check (role in ('caretaker')),
  created_by uuid not null,
  secret_hash text not null,
  expires_at timestamptz not null,
  max_uses int not null default 1,
  used_count int not null default 0,
  status text not null default 'active' check (status in ('active','used','revoked','expired')),
  accepted_by uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  household_id uuid,
  actor_id uuid,
  actor_type text not null default 'user',
  action text not null,
  target_type text not null,
  target_id text not null,
  before jsonb,
  after jsonb,
  command_id uuid,
  source text not null default 'liff',
  created_at timestamptz not null default now()
);

create table if not exists public.line_users (
  line_sub text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','unlinked','deleted')),
  display_name text,
  picture_url text,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.commands (
  command_id uuid primary key,
  user_id uuid not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  counts jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null
);

create table if not exists public.notification_log (
  id text primary key,
  household_id uuid not null,
  reminder_id uuid not null,
  due_date date not null,
  channel text not null,
  status text not null default 'sent',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create table if not exists public.line_events (
  event_id text primary key,
  status text not null default 'processed',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m
    join public.households h on h.id = m.household_id
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and h.deleted_at is null
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m
    join public.households h on h.id = m.household_id
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and h.deleted_at is null
  );
$$;

create or replace function public.list_invites(hid uuid)
returns table (
  id uuid,
  role text,
  status text,
  expires_at timestamptz,
  used_count int,
  max_uses int,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_household_owner(hid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select i.id, i.role, i.status, i.expires_at, i.used_count, i.max_uses, i.created_at
    from public.invites i
    where i.household_id = hid
    order by i.created_at desc;
end;
$$;

grant execute on function public.list_invites(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.animals enable row level security;
alter table public.records enable row level security;
alter table public.reminders enable row level security;
alter table public.task_completions enable row level security;
alter table public.invites enable row level security;
alter table public.audit_logs enable row level security;
alter table public.line_users enable row level security;
alter table public.commands enable row level security;
alter table public.rate_limits enable row level security;
alter table public.notification_log enable row level security;
alter table public.line_events enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists households_select_member on public.households;
create policy households_select_member on public.households
  for select to authenticated
  using (public.is_household_member(id));

drop policy if exists members_select_member on public.household_members;
create policy members_select_member on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists animals_select_member on public.animals;
create policy animals_select_member on public.animals
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists records_select_member on public.records;
create policy records_select_member on public.records
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists reminders_select_member on public.reminders;
create policy reminders_select_member on public.reminders
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists completions_select_member on public.task_completions;
create policy completions_select_member on public.task_completions
  for select to authenticated
  using (public.is_household_member(household_id));

-- Data API access is explicit; RLS still decides which rows are visible.
grant select on public.profiles, public.households, public.household_members,
  public.animals, public.records, public.reminders, public.task_completions
  to authenticated;

-- All writes go through Edge Functions using the service role.
-- invites/audit/line_users/commands/rate_limits/notification_log/line_events
-- remain server-only.

-- ---------------------------------------------------------------------------
