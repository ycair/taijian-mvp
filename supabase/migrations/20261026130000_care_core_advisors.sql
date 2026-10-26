-- Close advisor findings introduced by the 2A schema. Clients never read these
-- tables directly; all access goes through the privacy RPCs.
create index if not exists animal_lineage_created_by_idx
  on public.animal_lineage(created_by);
create index if not exists animal_transfers_created_by_idx
  on public.animal_transfers(created_by);
create index if not exists animal_transfers_target_household_idx
  on public.animal_transfers(target_household_id, status);

drop policy if exists animal_lineage_no_direct_access on public.animal_lineage;
create policy animal_lineage_no_direct_access on public.animal_lineage
  for select to authenticated
  using (false);

drop policy if exists animal_transfers_no_direct_access on public.animal_transfers;
create policy animal_transfers_no_direct_access on public.animal_transfers
  for select to authenticated
  using (false);
