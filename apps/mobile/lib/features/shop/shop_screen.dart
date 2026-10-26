import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import '../../core/widgets/common.dart';
import 'commerce_repository.dart';
import 'shop_models.dart';

class ShopScreen extends ConsumerWidget {
  const ShopScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    return DefaultTabController(
      length: 4,
      child: SafeArea(
        child: Column(
          children: [
            PageHeader(
              kicker: 'Shop',
              title: '苔間雜貨',
              subtitle: '沙盒商店：不會實際扣款或出貨。',
              trailing: IconButton(
                tooltip: '購物車',
                onPressed: () => _openCart(context, ref),
                icon: Badge(
                  isLabelVisible: cart.isNotEmpty,
                  label: Text('${cart.itemCount}'),
                  child: const Icon(Icons.shopping_bag_outlined),
                ),
              ),
            ),
            const TabBar(
              labelColor: AppTokens.primaryStrong,
              unselectedLabelColor: AppTokens.muted,
              indicatorColor: AppTokens.primary,
              tabs: [
                Tab(text: '商品'),
                Tab(text: '點數'),
                Tab(text: '訂閱'),
                Tab(text: '訂單'),
              ],
            ),
            const Expanded(
              child: TabBarView(
                children: [_ProductsTab(), _PointsTab(), _PlansTab(), _OrdersTab()],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static Future<void> _openCart(BuildContext context, WidgetRef ref) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => const _CartSheet(),
    );
  }
}

class _ProductsTab extends ConsumerWidget {
  const _ProductsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(shopProductsProvider);
    final cart = ref.watch(cartProvider);
    return RefreshIndicator(
      color: AppTokens.primary,
      onRefresh: () async => ref.invalidate(shopProductsProvider),
      child: products.when(
        loading: () => const LoadingView(),
        error: (error, stack) => ListView(
          children: [
            ErrorView(
              message: '讀取商品失敗，請稍後再試。',
              onRetry: () => ref.invalidate(shopProductsProvider),
            ),
          ],
        ),
        data: (items) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
          children: [
            const _SandboxBanner(),
            const SizedBox(height: 14),
            for (final product in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _ProductCard(
                  product: product,
                  quantity: cart
                      .where((line) => line.product.id == product.id)
                      .fold(0, (total, line) => total + line.quantity),
                  onAdd: product.stock == 0
                      ? null
                      : () => ref.read(cartProvider.notifier).add(product),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.quantity, this.onAdd});

  final ShopProduct product;
  final int quantity;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 58,
            height: 58,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppTokens.colorFromHex(product.accentColor).withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(AppTokens.radiusMd),
            ),
            child: Text(product.emoji, style: const TextStyle(fontSize: 28)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(product.description, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 5),
                Text(
                  '${product.priceLabel} · 庫存 ${product.stock}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTokens.primaryStrong),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            children: [
              if (quantity > 0)
                Text('$quantity', style: const TextStyle(fontWeight: FontWeight.w800, color: AppTokens.primaryStrong)),
              IconButton(
                tooltip: '加入購物車',
                onPressed: onAdd,
                icon: const Icon(Icons.add_circle_outline),
                color: AppTokens.primaryStrong,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PointsTab extends ConsumerStatefulWidget {
  const _PointsTab();

  @override
  ConsumerState<_PointsTab> createState() => _PointsTabState();
}

class _PointsTabState extends ConsumerState<_PointsTab> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final ledger = ref.watch(pointsLedgerProvider);
    return RefreshIndicator(
      color: AppTokens.primary,
      onRefresh: () async => ref.invalidate(pointsLedgerProvider),
      child: ledger.when(
        loading: () => const LoadingView(),
        error: (error, stack) => ListView(
          children: [
            ErrorView(
              message: '讀取點數失敗，請稍後再試。',
              onRetry: () => ref.invalidate(pointsLedgerProvider),
            ),
          ],
        ),
        data: (entries) {
          final balance = entries.fold(0, (total, entry) => total + entry.delta);
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 36),
            children: [
              MossCard(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(color: AppTokens.butter, shape: BoxShape.circle),
                      child: const Icon(Icons.stars_outlined, color: AppTokens.ink),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('目前點數', style: Theme.of(context).textTheme.bodySmall),
                          Text('$balance', style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ),
                    FilledButton(
                      onPressed: _busy ? null : _checkIn,
                      child: Text(_busy ? '簽到中…' : '每日簽到'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              const _SandboxBanner(text: '每日簽到獲得 10 點；點數可折抵訂單，1 點 = NT\$1。'),
              const SizedBox(height: 20),
              Text('點數紀錄', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (entries.isEmpty)
                MossCard(child: Text('還沒有點數紀錄。', style: Theme.of(context).textTheme.bodySmall))
              else
                MossCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Column(
                    children: [
                      for (final entry in entries)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(entry.reasonLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
                                    Text(formatDateTime(entry.createdAt, 'Asia/Taipei'), style: Theme.of(context).textTheme.bodySmall),
                                  ],
                                ),
                              ),
                              Text(
                                '${entry.delta > 0 ? '+' : ''}${entry.delta}',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: entry.delta > 0 ? AppTokens.primaryStrong : AppTokens.overdue,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _checkIn() async {
    setState(() => _busy = true);
    try {
      await ref.read(commerceRepositoryProvider).checkIn();
      ref.invalidate(pointsLedgerProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('簽到完成，明天再來。')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('簽到失敗：$error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _PlansTab extends ConsumerStatefulWidget {
  const _PlansTab();

  @override
  ConsumerState<_PlansTab> createState() => _PlansTabState();
}

class _PlansTabState extends ConsumerState<_PlansTab> {
  String? _busyPlan;

  @override
  Widget build(BuildContext context) {
    final plans = ref.watch(subscriptionPlansProvider);
    final current = ref.watch(profileSubscriptionProvider);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 36),
      children: [
        const _SandboxBanner(text: '訂閱是沙盒 demo：不會連到 StoreKit，也不會收費。'),
        const SizedBox(height: 14),
        if (current.value?.isActive == true)
          MossCard(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.favorite, color: AppTokens.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '目前支持者方案：${current.value!.planId}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                TextButton(
                  onPressed: () => _cancelSubscription(),
                  child: const Text('取消'),
                ),
              ],
            ),
          ),
        const SizedBox(height: 10),
        plans.when(
          loading: () => const LoadingView(),
          error: (error, stack) => ErrorView(
            message: '讀取方案失敗。',
            onRetry: () => ref.invalidate(subscriptionPlansProvider),
          ),
          data: (items) => Column(
            children: [
              for (final plan in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: MossCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(plan.name, style: Theme.of(context).textTheme.titleMedium),
                            ),
                            Text(plan.priceLabel, style: const TextStyle(fontWeight: FontWeight.w800, color: AppTokens.primaryStrong)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        for (final benefit in plan.benefits)
                          Padding(
                            padding: const EdgeInsets.only(top: 3),
                            child: Row(
                              children: [
                                const Icon(Icons.check, size: 15, color: AppTokens.primary),
                                const SizedBox(width: 6),
                                Expanded(child: Text(benefit, style: Theme.of(context).textTheme.bodySmall)),
                              ],
                            ),
                          ),
                        const SizedBox(height: 10),
                        Align(
                          alignment: Alignment.centerRight,
                          child: OutlinedButton(
                            onPressed: _busyPlan == null
                                ? () => _activate(plan)
                                : null,
                            child: Text(_busyPlan == plan.id ? '啟用中…' : '沙盒支持'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _activate(SubscriptionPlan plan) async {
    setState(() => _busyPlan = plan.id);
    try {
      await ref.read(commerceRepositoryProvider).activateSubscription(plan);
      ref.invalidate(profileSubscriptionProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('沙盒訂閱已啟用，不會實際扣款。')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('啟用失敗：$error')));
      }
    } finally {
      if (mounted) setState(() => _busyPlan = null);
    }
  }

  Future<void> _cancelSubscription() async {
    try {
      await ref.read(commerceRepositoryProvider).cancelSubscription();
      ref.invalidate(profileSubscriptionProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('沙盒訂閱已取消。')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('取消失敗：$error')));
      }
    }
  }
}

class _OrdersTab extends ConsumerWidget {
  const _OrdersTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(shopOrdersProvider);
    return RefreshIndicator(
      color: AppTokens.primary,
      onRefresh: () async => ref.invalidate(shopOrdersProvider),
      child: orders.when(
        loading: () => const LoadingView(),
        error: (error, stack) => ListView(
          children: [
            ErrorView(
              message: '讀取訂單失敗。',
              onRetry: () => ref.invalidate(shopOrdersProvider),
            ),
          ],
        ),
        data: (items) => items.isEmpty
            ? ListView(
                padding: const EdgeInsets.only(top: 36),
                children: const [
                  EmptyState(title: '還沒有訂單', body: '商店目前是 sandbox，下單不會實際出貨。'),
                ],
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 36),
                children: [
                  for (final order in items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _OrderCard(order: order),
                    ),
                ],
              ),
      ),
    );
  }
}

class _OrderCard extends ConsumerWidget {
  const _OrderCard({required this.order});

  final ShopOrder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MossCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.isCancelled ? '已取消訂單' : '已確認 · 沙盒',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(order.totalLabel, style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 5),
          Text(formatDateTime(order.createdAt, 'Asia/Taipei'), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          for (final item in order.items)
            Text('${item.name} × ${item.quantity}', style: const TextStyle(fontSize: 13)),
          if (order.pointsUsed > 0) ...[
            const SizedBox(height: 4),
            Text('使用 ${order.pointsUsed} 點', style: Theme.of(context).textTheme.bodySmall),
          ],
          if (!order.isCancelled) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () async {
                  try {
                    await ref.read(commerceRepositoryProvider).cancelOrder(order);
                    ref.invalidate(shopOrdersProvider);
                    ref.invalidate(shopProductsProvider);
                    ref.invalidate(pointsLedgerProvider);
                  } catch (error) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('取消失敗：$error')),
                      );
                    }
                  }
                },
                child: const Text('取消訂單'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CartSheet extends ConsumerStatefulWidget {
  const _CartSheet();

  @override
  ConsumerState<_CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends ConsumerState<_CartSheet> {
  final _pointsController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _pointsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final ledger = ref.watch(pointsLedgerProvider).value ?? const <PointsEntry>[];
    final balance = ledger.fold(0, (total, entry) => total + entry.delta);
    final subtotal = cart.totalCents;
    final maxPoints = math.min(balance, subtotal ~/ 100);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('購物車', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (cart.isEmpty)
              const Text('購物車是空的。')
            else ...[
              for (final line in cart)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Row(
                    children: [
                      Text(line.product.emoji, style: const TextStyle(fontSize: 24)),
                      const SizedBox(width: 10),
                      Expanded(child: Text(line.product.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                      IconButton(
                        onPressed: () => ref.read(cartProvider.notifier).decrement(line.product.id),
                        icon: const Icon(Icons.remove_circle_outline, size: 20),
                      ),
                      Text('${line.quantity}'),
                      IconButton(
                        onPressed: () => ref.read(cartProvider.notifier).increment(line.product.id),
                        icon: const Icon(Icons.add_circle_outline, size: 20),
                      ),
                      SizedBox(
                        width: 58,
                        child: Text(
                          'NT\$ ${(line.totalCents / 100).toStringAsFixed(0)}',
                          textAlign: TextAlign.right,
                        ),
                      ),
                    ],
                  ),
                ),
              const Divider(height: 20),
              TextField(
                controller: _pointsController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: '使用點數（1 點 = NT\$1）',
                  helperText: '可用 $balance 點，最多折抵 $maxPoints 點',
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('小計', style: TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Text('NT\$ ${(subtotal / 100).toStringAsFixed(0)}'),
                ],
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _busy ? null : () => _place(cart, subtotal, balance),
                child: Text(_busy ? '建立訂單中…' : '建立沙盒訂單'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _place(List<CartLine> cart, int subtotal, int balance) async {
    final points = int.tryParse(_pointsController.text.trim()) ?? 0;
    final maxPoints = math.min(balance, subtotal ~/ 100);
    if (points < 0 || points > maxPoints) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('點數需介於 0 到 $maxPoints。')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(commerceRepositoryProvider).placeOrder(cart, pointsUsed: points);
      ref.read(cartProvider.notifier).clear();
      ref.invalidate(shopProductsProvider);
      ref.invalidate(shopOrdersProvider);
      ref.invalidate(pointsLedgerProvider);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('沙盒訂單已建立，不會實際扣款或出貨。')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('下單失敗：$error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _SandboxBanner extends StatelessWidget {
  const _SandboxBanner({this.text = '這是 sandbox 商店：不會串接真實付款或出貨。'});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppTokens.butter.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
      ),
      child: Row(
        children: [
          const Icon(Icons.science_outlined, size: 17, color: AppTokens.primaryStrong),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 12, height: 1.4))),
        ],
      ),
    );
  }
}
