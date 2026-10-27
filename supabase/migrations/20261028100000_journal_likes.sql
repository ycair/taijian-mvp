-- J3 first interaction: one like per profile per journal entry.

create table if not exists public.journal_likes (
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, profile_id)
);

alter table public.journal_likes enable row level security;
drop policy if exists journal_likes_read on public.journal_likes;
create policy journal_likes_read on public.journal_likes
  for select to authenticated using (true);
grant select on public.journal_likes to authenticated;
revoke insert, update, delete on public.journal_likes from authenticated;
revoke all on public.journal_likes from public, anon;
grant select, insert, update, delete on public.journal_likes to service_role;

comment on table public.journal_likes is 'One like per profile per journal entry; writes are command-only.';
