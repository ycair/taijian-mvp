-- Harden foundation identity:
-- - keep refresh-token history so replayed tokens can revoke the session
-- - one identity per provider per profile
-- - server-only access for the history table

create table if not exists public.auth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.auth_sessions(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists auth_refresh_tokens_session_idx
  on public.auth_refresh_tokens(session_id);

alter table public.auth_identities
  add constraint auth_identities_profile_provider_key unique (profile_id, provider);

alter table public.auth_refresh_tokens enable row level security;
revoke all on public.auth_refresh_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.auth_refresh_tokens to service_role;
