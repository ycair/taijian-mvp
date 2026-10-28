-- Follow/block controls for public Journal authors.
create table if not exists public.profile_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create table if not exists public.profile_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.profile_follows enable row level security;
alter table public.profile_blocks enable row level security;
revoke all on public.profile_follows, public.profile_blocks from authenticated, anon, public;
grant select, insert, update, delete on public.profile_follows, public.profile_blocks to service_role;
