-- Monthly journal photo quota, tied to sandbox supporter plans.
alter table public.subscription_plans
  add column if not exists photo_quota int not null default 60 check (photo_quota >= 0);
update public.subscription_plans set photo_quota = 120 where id = 'sprout';
update public.subscription_plans set photo_quota = 240 where id = 'stone';
update public.subscription_plans set photo_quota = 500 where id = 'forest';
update public.subscription_plans set photo_quota = 60 where id not in ('sprout','stone','forest');

create table if not exists public.journal_photo_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,
  used int not null default 0 check (used >= 0),
  primary key (profile_id, month)
);
alter table public.journal_photo_usage enable row level security;
revoke all on public.journal_photo_usage from authenticated, anon, public;
grant select, insert, update, delete on public.journal_photo_usage to service_role;

create or replace function public.journal_photo_quota()
returns table(used int, quota int, month date)
language sql
stable
security definer
set search_path = public
as $$
  with current_month as (
    select date_trunc('month', now() at time zone 'UTC')::date as month
  ), quota as (
    select coalesce(
      (select sp.photo_quota
       from profile_subscriptions ps
       join subscription_plans sp on sp.id = ps.plan_id
       where ps.profile_id = auth.uid()
         and ps.status = 'active'
         and ps.expires_at > now()
       limit 1),
      60
    )::int as quota
  )
  select
    coalesce((select used from journal_photo_usage u
              where u.profile_id = auth.uid() and u.month = (select month from current_month)), 0)::int,
    (select quota from quota),
    (select month from current_month);
$$;
revoke execute on function public.journal_photo_quota() from public, anon, authenticated;
grant execute on function public.journal_photo_quota() to authenticated;
