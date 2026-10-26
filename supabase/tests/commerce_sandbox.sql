\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regclass('public.shop_products') is null then raise exception 'shop_products missing'; end if;
  if to_regclass('public.shop_orders') is null then raise exception 'shop_orders missing'; end if;
  if to_regclass('public.points_ledger') is null then raise exception 'points_ledger missing'; end if;
  if to_regclass('public.profile_subscriptions') is null then raise exception 'profile_subscriptions missing'; end if;
  if (select count(*) from public.shop_products) < 5 then raise exception 'products seed incomplete'; end if;
  if (select count(*) from public.subscription_plans) < 3 then raise exception 'plans seed incomplete'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.shop_products'::regclass) then
    raise exception 'shop_products RLS disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.points_ledger'::regclass) then
    raise exception 'points_ledger RLS disabled';
  end if;
  if has_table_privilege('anon', 'public.shop_products', 'SELECT') then
    raise exception 'anon can read shop_products';
  end if;
end $$;

select 'commerce sandbox schema OK' as result;
rollback;
