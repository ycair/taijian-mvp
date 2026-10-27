-- Public, read-only resident care records through an unlisted resident token.

alter table public.animals
  add column if not exists record_visibility text not null default 'private'
    check (record_visibility in ('private','public')),
  add column if not exists public_token text unique,
  add column if not exists public_at timestamptz;

create unique index if not exists animals_public_token_idx
  on public.animals(public_token)
  where public_token is not null and deleted_at is null;

comment on column public.animals.record_visibility is 'Owner opt-in for public, read-only care records.';
comment on column public.animals.public_token is 'Opaque token for the unlisted public resident page.';
