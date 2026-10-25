-- Harden the demo API surface.
-- Supabase grants new public tables to anon/authenticated by default. RLS still
-- blocks writes, but explicit revokes keep server-only tables off the Data API.

revoke all on public.profiles, public.households, public.household_members,
  public.animals, public.records, public.reminders, public.task_completions
  from anon, authenticated;

grant select on public.profiles, public.households, public.household_members,
  public.animals, public.records, public.reminders, public.task_completions
  to authenticated;

revoke all on public.invites, public.audit_logs, public.line_users,
  public.commands, public.rate_limits, public.notification_log, public.line_events
  from anon, authenticated;

revoke execute on function public.is_household_member(uuid) from anon;
revoke execute on function public.is_household_owner(uuid) from anon;
revoke execute on function public.list_invites(uuid) from anon;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.list_invites(uuid) to authenticated;

create index if not exists households_owner_idx
  on public.households(owner_id);
create index if not exists invites_household_idx
  on public.invites(household_id, created_at desc);
create index if not exists line_users_user_idx
  on public.line_users(user_id);
create index if not exists reminders_animal_idx
  on public.reminders(animal_id) where deleted_at is null;

-- One permissive SELECT policy per table also avoids the multiple-policy advisor.
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_select_household on public.profiles;
create policy profiles_select_member on public.profiles
  for select to authenticated
  using (
    (select auth.uid()) = id
    or exists (
      select 1
      from public.household_members me
      join public.household_members them
        on them.household_id = me.household_id
      where me.user_id = (select auth.uid())
        and them.user_id = profiles.id
    )
  );
