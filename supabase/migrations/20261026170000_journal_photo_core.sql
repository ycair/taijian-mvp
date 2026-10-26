-- Journal 3A: household photo journal entries with private Supabase Storage.

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  body text not null default '',
  journal_date date not null default current_date,
  animal_ids uuid[] not null default '{}',
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  cover_path text,
  revision int not null default 0,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_changed_fields text[] not null default '{}'
);
create index if not exists journal_entries_household_idx
  on public.journal_entries(household_id, journal_date desc)
  where deleted_at is null;

alter table public.journal_entries enable row level security;
drop policy if exists journal_entries_read on public.journal_entries;
create policy journal_entries_read on public.journal_entries
  for select to authenticated using (public.is_household_member(household_id));
grant select on public.journal_entries to authenticated;
revoke insert, update, delete on public.journal_entries from authenticated;
revoke all on public.journal_entries from public, anon;
grant select, insert, update, delete on public.journal_entries to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-photos', 'journal-photos', false, 8388608,
  array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists journal_photos_select on storage.objects;
create policy journal_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'journal-photos'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists journal_photos_insert on storage.objects;
create policy journal_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'journal-photos'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists journal_photos_update on storage.objects;
create policy journal_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'journal-photos'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'journal-photos'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists journal_photos_delete on storage.objects;
create policy journal_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'journal-photos'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

comment on table public.journal_entries is 'Household journal entries; photos are stored privately in journal-photos.';
