\set ON_ERROR_STOP on

do $$
declare
  missing text;
  line_profiles integer;
  line_identities integer;
begin
  if to_regclass('public.auth_identities') is null then
    raise exception 'auth_identities table is missing';
  end if;
  if to_regclass('public.auth_sessions') is null then
    raise exception 'auth_sessions table is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'status'
  ) then
    raise exception 'profiles.status is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invites' and column_name = 'invite_type'
  ) then
    raise exception 'invites.invite_type is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invites' and column_name = 'invited_user_id'
  ) then
    raise exception 'invites.invited_user_id is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.auth_identities'::regclass
      and contype = 'u'
  ) then
    raise exception 'auth_identities unique constraint is missing';
  end if;

  select count(*) into line_profiles from public.profiles where line_sub is not null;
  select count(*) into line_identities from public.auth_identities
  where provider = 'line' and subject is not null;

  if line_identities < line_profiles then
    raise exception 'LINE identities were not backfilled (% profiles, % identities)', line_profiles, line_identities;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.line_sub is not null
      and not exists (
        select 1 from public.auth_identities i
        where i.profile_id = p.id and i.provider = 'line' and i.subject = p.line_sub
      )
  ) then
    raise exception 'a LINE profile is missing its auth identity';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.auth_identities'::regclass) then
    raise exception 'auth_identities RLS is disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.auth_sessions'::regclass) then
    raise exception 'auth_sessions RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.auth_identities', 'SELECT') then
    raise exception 'anon can select auth_identities';
  end if;
  if has_table_privilege('authenticated', 'public.auth_sessions', 'SELECT') then
    raise exception 'authenticated can select auth_sessions';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'status' and column_default = '''active''::text'
  ) then
    raise exception 'profiles.status default is not active';
  end if;

  if exists (select 1 from public.invites where invite_type is null) then
    raise exception 'an invite has no invite_type';
  end if;
end $$;

select 'foundation identity schema OK' as result;
