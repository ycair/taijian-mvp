-- Journal J2/J3 visibility and unlisted share tokens.

alter table public.journal_entries
  add column if not exists visibility text not null default 'household'
    check (visibility in ('household','link','public')),
  add column if not exists share_token text unique,
  add column if not exists published_at timestamptz;

create index if not exists journal_public_feed_idx
  on public.journal_entries(published_at desc)
  where deleted_at is null and visibility = 'public';

-- Public/link entries are read through a server-side function so private
-- household entries never become visible through PostgREST.
comment on column public.journal_entries.visibility is 'household | link | public; public reads go through journal-public.';
comment on column public.journal_entries.share_token is 'Unlisted J2 token; never expose it for household-only entries.';
