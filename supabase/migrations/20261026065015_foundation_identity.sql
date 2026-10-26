-- Foundation identity: provider mappings, rotating sessions, and invite types.
-- Apple is reserved in the provider check for a future re-enable; no Apple flow
-- is exposed by the current product.

create table if not exists public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('line','apple','google','guest')),
  subject text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (provider, subject)
);

create index if not exists auth_identities_profile_idx
  on public.auth_identities(profile_id);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  refresh_token_hash text not null unique,
  platform text not null check (platform in ('ios','liff')),
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists auth_sessions_profile_idx
  on public.auth_sessions(profile_id);

alter table public.profiles
  add column if not exists status text not null default 'active'
  check (status in ('active','disabled','deleted'));

alter table public.invites
  add column if not exists invite_type text not null default 'link'
    check (invite_type in ('link','uid')),
  add column if not exists invited_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists invited_label text;

create index if not exists invites_invited_user_idx
  on public.invites(invited_user_id) where invited_user_id is not null;

-- Existing LINE profiles keep working during the auth migration.
insert into public.auth_identities (profile_id, provider, subject)
select id, 'line', line_sub
from public.profiles
where line_sub is not null
on conflict (provider, subject) do nothing;

alter table public.auth_identities enable row level security;
alter table public.auth_sessions enable row level security;

revoke all on public.auth_identities, public.auth_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.auth_identities, public.auth_sessions to service_role;

comment on table public.auth_identities is
  'Provider subject to canonical profile mapping. Apple is reserved, not active.';
comment on table public.auth_sessions is
  'Opaque rotating refresh sessions; access JWTs carry the session id.';
