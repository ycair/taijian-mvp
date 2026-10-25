-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
-- Revoke from PUBLIC/anon/authenticated, then grant only authenticated.
revoke execute on function public.is_household_member(uuid) from public, anon, authenticated;
revoke execute on function public.is_household_owner(uuid) from public, anon, authenticated;
revoke execute on function public.list_invites(uuid) from public, anon, authenticated;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.list_invites(uuid) to authenticated;
