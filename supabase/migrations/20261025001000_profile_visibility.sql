-- Household members may see each other's display names.
-- Reads remain limited to profiles that share at least one household.

drop policy if exists profiles_select_household on public.profiles;
create policy profiles_select_household on public.profiles
  for select using (
    exists (
      select 1
      from public.household_members me
      join public.household_members them
        on them.household_id = me.household_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );
