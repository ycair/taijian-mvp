-- Commerce sandbox: catalog, orders, points, and manual subscription plans.
-- No real payment or StoreKit/IAP is involved.

create table if not exists public.shop_products (
  id text primary key,
  name text not null,
  description text not null default '',
  price_cents int not null check (price_cents >= 0),
  stock int not null default 0 check (stock >= 0),
  emoji text not null default '🌿',
  accent_color text not null default '#7C9A76',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.shop_products
  (id, name, description, price_cents, stock, emoji, accent_color, sort_order)
values
  ('moss-hide', '苔間躲避屋', '讓居民有一個安靜的角落。', 48000, 12, '🪵', '#A8BFA3', 10),
  ('cricket-pack', '蟋蟀飼料包', '一包約 30 隻，適合中小型居民。', 12000, 50, '🦗', '#C7B198', 20),
  ('misting-bottle', '細霧噴瓶', '日常保濕與環境維持。', 25000, 20, '💧', '#9EADB8', 30),
  ('leaf-mat', '落葉墊材', '天然落葉，適合打造躲藏層。', 18000, 30, '🍂', '#D9A5A0', 40),
  ('care-card', '照護紀錄卡', '手寫每日照護，也可當作旅程小卡。', 8000, 100, '📒', '#F4D9B0', 50)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  stock = excluded.stock,
  emoji = excluded.emoji,
  accent_color = excluded.accent_color,
  sort_order = excluded.sort_order;

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  items jsonb not null,
  subtotal_cents int not null check (subtotal_cents >= 0),
  points_used int not null default 0 check (points_used >= 0),
  total_cents int not null check (total_cents >= 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  payment_method text not null default 'sandbox' check (payment_method = 'sandbox'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_orders_household_idx on public.shop_orders(household_id, created_at desc);
create index if not exists shop_orders_profile_idx on public.shop_orders(profile_id, created_at desc);

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  delta int not null check (delta <> 0),
  reason text not null,
  checkin_date date,
  created_at timestamptz not null default now()
);
create index if not exists points_ledger_profile_idx on public.points_ledger(profile_id, created_at desc);
create unique index if not exists points_checkin_unique
  on public.points_ledger(profile_id, checkin_date)
  where reason = 'check_in';

create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  monthly_price_twd int not null check (monthly_price_twd >= 0),
  benefits jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.subscription_plans (id, name, monthly_price_twd, benefits, sort_order)
values
  ('sprout', '小草', 99, '["支持苔間營運","支持者標記","每月旅程照片額度"]'::jsonb, 10),
  ('stone', '苔石', 199, '["小草全部權益","新功能優先體驗","支持者標記"]'::jsonb, 20),
  ('forest', '森語', 399, '["苔石全部權益","每月更多照片額度","未來周邊優先購買"]'::jsonb, 30)
on conflict (id) do update set
  name = excluded.name,
  monthly_price_twd = excluded.monthly_price_twd,
  benefits = excluded.benefits,
  sort_order = excluded.sort_order;

create table if not exists public.profile_subscriptions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sandbox boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.shop_products enable row level security;
alter table public.shop_orders enable row level security;
alter table public.points_ledger enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.profile_subscriptions enable row level security;

drop policy if exists shop_products_read on public.shop_products;
create policy shop_products_read on public.shop_products
  for select to authenticated using (active = true);

drop policy if exists shop_orders_read on public.shop_orders;
create policy shop_orders_read on public.shop_orders
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists points_ledger_read on public.points_ledger;
create policy points_ledger_read on public.points_ledger
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists subscription_plans_read on public.subscription_plans;
create policy subscription_plans_read on public.subscription_plans
  for select to authenticated using (active = true);

drop policy if exists profile_subscriptions_read on public.profile_subscriptions;
create policy profile_subscriptions_read on public.profile_subscriptions
  for select to authenticated using (profile_id = (select auth.uid()));

grant select on public.shop_products, public.shop_orders, public.points_ledger,
  public.subscription_plans, public.profile_subscriptions to authenticated;
revoke all on public.shop_products, public.shop_orders, public.points_ledger,
  public.subscription_plans, public.profile_subscriptions from public, anon;
revoke insert, update, delete on public.shop_products, public.shop_orders, public.points_ledger,
  public.subscription_plans, public.profile_subscriptions from authenticated;
grant select, insert, update, delete on public.shop_products, public.shop_orders, public.points_ledger,
  public.subscription_plans, public.profile_subscriptions to service_role;

comment on table public.shop_orders is 'Sandbox orders only; no payment is collected.';
comment on table public.profile_subscriptions is 'Manual sandbox subscriptions; not StoreKit verified.';
