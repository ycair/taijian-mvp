# Commerce sandbox (3A start)

## Scope

This is a **sandbox/manual commerce demo**. It deliberately does not use
StoreKit, App Store receipts, real payments, carrier integration, or shipping.

- Shop catalog with demo products and stock.
- Household order creation from a local cart.
- Points ledger and daily check-in.
- Points redemption at 1 point = NT$1.
- Cancel an order and restore stock/points.
- Three supporter plans with manual 30-day sandbox activation.
- Orders/points/subscriptions are readable by the permitted household/profile;
  writes go through server-authoritative `execute-command`.

## Data

Migration `20261026160000_commerce_sandbox` adds:

- `shop_products`
- `shop_orders`
- `points_ledger`
- `subscription_plans`
- `profile_subscriptions`

All client tables use RLS; writes are revoked from `authenticated` and handled
by commands with revision/audit semantics where applicable.

## Commands

- `points.checkIn`
- `shop.order.create`
- `shop.order.cancel`
- `subscription.activate`
- `subscription.cancel`

Prices are stored in cents. Subscription activation is a manual sandbox state
only and does not collect payment.

## UI

- New iOS bottom-nav `雜貨` tab.
- Tabs: products, points, subscription plans, orders.
- Cart is in memory for the current app session.
- LIFF gets the refreshed brand shell but does not yet expose commerce.

## Verification

- SQL schema/RLS checks.
- Local command integration: check-in, points redemption, order stock
  decrement, cancel refund/restore, subscription activate/cancel.
- Flutter analyzer/tests.
