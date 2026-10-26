-- Proposals and upvotes (附議), a lightweight product feedback board.

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 5000),
  status text not null default 'open'
    check (status in ('open','in_progress','adopted','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists proposals_created_idx
  on public.proposals(created_at desc)
  where deleted_at is null;

create table if not exists public.proposal_votes (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (proposal_id, profile_id)
);

alter table public.proposals enable row level security;
alter table public.proposal_votes enable row level security;

drop policy if exists proposals_read on public.proposals;
create policy proposals_read on public.proposals
  for select to authenticated using (deleted_at is null);
drop policy if exists proposal_votes_read on public.proposal_votes;
create policy proposal_votes_read on public.proposal_votes
  for select to authenticated using (true);

grant select on public.proposals, public.proposal_votes to authenticated;
revoke insert, update, delete on public.proposals, public.proposal_votes from authenticated;
revoke all on public.proposals, public.proposal_votes from public, anon;
grant select, insert, update, delete on public.proposals, public.proposal_votes to service_role;

create or replace function public.proposals_list()
returns table (
  id uuid,
  title text,
  body text,
  status text,
  author_name text,
  author_avatar text,
  vote_count integer,
  voted boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.body,
    p.status,
    coalesce(pr.display_name, '苔友') as author_name,
    pr.avatar_url as author_avatar,
    count(v.profile_id)::int as vote_count,
    exists (
      select 1 from proposal_votes mine
      where mine.proposal_id = p.id and mine.profile_id = auth.uid()
    ) as voted,
    p.created_at
  from proposals p
  join profiles pr on pr.id = p.author_id
  left join proposal_votes v on v.proposal_id = p.id
  where p.deleted_at is null
  group by p.id, p.title, p.body, p.status, pr.display_name, pr.avatar_url, p.created_at
  order by p.created_at desc;
$$;

revoke execute on function public.proposals_list() from public, anon, authenticated;
grant execute on function public.proposals_list() to authenticated;

comment on table public.proposals is 'Authenticated proposal board; one vote per profile.';
