-- Security audit hardening: remove Supabase default table privileges and
-- direct client access to social join rows that are only read through RPCs.

revoke all on public.journal_entries, public.journal_likes, public.proposals,
  public.proposal_votes, public.map_zones, public.animal_positions,
  public.points_ledger, public.profile_subscriptions, public.shop_orders,
  public.shop_products, public.subscription_plans
from authenticated;

grant select on public.journal_entries to authenticated;
grant select on public.proposals to authenticated;
grant select on public.map_zones, public.animal_positions to authenticated;
grant select on public.points_ledger, public.profile_subscriptions to authenticated;
grant select on public.shop_orders, public.shop_products, public.subscription_plans to authenticated;

drop policy if exists journal_likes_read on public.journal_likes;
drop policy if exists proposal_votes_read on public.proposal_votes;

-- Vote rows are aggregated by proposals_list(); clients must not read raw
-- voter profile IDs or subscribe to them.
alter publication supabase_realtime drop table public.proposal_votes;
