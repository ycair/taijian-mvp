-- J3 comments and reports for public/link journal entries.

create table if not exists public.journal_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists journal_comments_entry_idx
  on public.journal_comments(entry_id, created_at)
  where deleted_at is null;

create table if not exists public.journal_reports (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.journal_entries(id) on delete cascade,
  comment_id uuid references public.journal_comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  check (entry_id is not null or comment_id is not null)
);

alter table public.journal_comments enable row level security;
alter table public.journal_reports enable row level security;

-- No direct client reads: comments are returned through journal-public with
-- author display names; reports are server/admin-only.
revoke all on public.journal_comments, public.journal_reports from authenticated, anon, public;
grant select, insert, update, delete on public.journal_comments, public.journal_reports to service_role;

comment on table public.journal_comments is 'Public/link journal comments; writes via execute-command.';
comment on table public.journal_reports is 'User reports for moderation; no admin console yet.';
