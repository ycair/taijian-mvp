import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';
import 'shop_models.dart';

class CommerceRepository {
  CommerceRepository({
    required this.rest,
    required this.commands,
    required this.householdId,
    required this.uid,
  });

  final SupabaseRestClient? rest;
  final CommandService commands;
  final String? householdId;
  final String? uid;

  static const _fallbackProducts = <ShopProduct>[
    ShopProduct(id: 'moss-hide', name: '苔間躲避屋', description: '讓居民有一個安靜的角落。', priceCents: 48000, stock: 12, emoji: '🪵', accentColor: '#A8BFA3'),
    ShopProduct(id: 'cricket-pack', name: '蟋蟀飼料包', description: '一包約 30 隻，適合中小型居民。', priceCents: 12000, stock: 50, emoji: '🦗', accentColor: '#C7B198'),
    ShopProduct(id: 'misting-bottle', name: '細霧噴瓶', description: '日常保濕與環境維持。', priceCents: 25000, stock: 20, emoji: '💧', accentColor: '#9EADB8'),
    ShopProduct(id: 'leaf-mat', name: '落葉墊材', description: '天然落葉，適合打造躲藏層。', priceCents: 18000, stock: 30, emoji: '🍂', accentColor: '#D9A5A0'),
    ShopProduct(id: 'care-card', name: '照護紀錄卡', description: '手寫每日照護，也可當作旅程小卡。', priceCents: 8000, stock: 100, emoji: '📒', accentColor: '#F4D9B0'),
  ];

  static const _fallbackPlans = <SubscriptionPlan>[
    SubscriptionPlan(id: 'sprout', name: '小草', monthlyPriceTwd: 99, benefits: ['支持苔間營運', '支持者標記', '每月旅程照片額度']),
    SubscriptionPlan(id: 'stone', name: '苔石', monthlyPriceTwd: 199, benefits: ['小草全部權益', '新功能優先體驗', '支持者標記']),
    SubscriptionPlan(id: 'forest', name: '森語', monthlyPriceTwd: 399, benefits: ['苔石全部權益', '每月更多照片額度', '未來周邊優先購買']),
  ];

  Future<List<ShopProduct>> fetchProducts() async {
    final client = rest;
    if (client == null) return _fallbackProducts;
    final rows = await client.select(
      'shop_products',
      query: 'select=*&active=eq.true&order=sort_order.asc',
    );
    return rows.map((row) => ShopProduct.fromMap(snakeToCamelMap(row))).toList(growable: false);
  }

  Future<List<ShopOrder>> fetchOrders() async {
    final client = rest;
    final household = householdId;
    if (client == null || household == null) return const [];
    final rows = await client.select(
      'shop_orders',
      query: 'select=*&household_id=eq.${Uri.encodeQueryComponent(household)}&order=created_at.desc',
    );
    return rows.map((row) => ShopOrder.fromMap(snakeToCamelMap(row))).toList(growable: false);
  }

  Future<List<PointsEntry>> fetchPoints() async {
    final client = rest;
    final user = uid;
    if (client == null || user == null) return const [];
    final rows = await client.select(
      'points_ledger',
      query: 'select=*&profile_id=eq.${Uri.encodeQueryComponent(user)}&order=created_at.desc',
    );
    return rows.map((row) => PointsEntry.fromMap(snakeToCamelMap(row))).toList(growable: false);
  }

  Future<List<SubscriptionPlan>> fetchPlans() async {
    final client = rest;
    if (client == null) return _fallbackPlans;
    final rows = await client.select(
      'subscription_plans',
      query: 'select=*&active=eq.true&order=sort_order.asc',
    );
    return rows.map((row) => SubscriptionPlan.fromMap(snakeToCamelMap(row))).toList(growable: false);
  }

  Future<ProfileSubscription?> fetchSubscription() async {
    final client = rest;
    final user = uid;
    if (client == null || user == null) return null;
    final rows = await client.select(
      'profile_subscriptions',
      query: 'select=*&profile_id=eq.${Uri.encodeQueryComponent(user)}',
    );
    if (rows.isEmpty) return null;
    return ProfileSubscription.fromMap(snakeToCamelMap(rows.first));
  }

  Future<void> checkIn() async {
    if (householdId == null) throw StateError('No household');
    await commands.submit('points.checkIn', {}, householdId: householdId);
  }

  Future<void> placeOrder(List<CartLine> lines, {int pointsUsed = 0}) async {
    if (householdId == null) throw StateError('No household');
    if (lines.isEmpty) throw StateError('Cart is empty');
    await commands.submit(
      'shop.order.create',
      {
        'items': [
          for (final line in lines) {'productId': line.product.id, 'quantity': line.quantity},
        ],
        'pointsUsed': pointsUsed,
      },
      householdId: householdId,
    );
  }

  Future<void> cancelOrder(ShopOrder order) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'shop.order.cancel',
      {'orderId': order.id},
      householdId: householdId,
    );
  }

  Future<void> activateSubscription(SubscriptionPlan plan) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'subscription.activate',
      {'planId': plan.id},
      householdId: householdId,
    );
  }

  Future<void> cancelSubscription() async {
    if (householdId == null) throw StateError('No household');
    await commands.submit('subscription.cancel', {}, householdId: householdId);
  }
}

final commerceRepositoryProvider = Provider<CommerceRepository>((ref) {
  return CommerceRepository(
    rest: ref.watch(appDependenciesProvider).rest,
    commands: ref.watch(commandServiceProvider),
    householdId: ref.watch(householdIdProvider),
    uid: ref.watch(currentUserProvider)?.uid,
  );
});

final shopProductsProvider = FutureProvider<List<ShopProduct>>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(commerceRepositoryProvider).fetchProducts();
});
final shopOrdersProvider = FutureProvider<List<ShopOrder>>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(commerceRepositoryProvider).fetchOrders();
});
final pointsLedgerProvider = FutureProvider<List<PointsEntry>>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(commerceRepositoryProvider).fetchPoints();
});
final subscriptionPlansProvider = FutureProvider<List<SubscriptionPlan>>((ref) {
  return ref.watch(commerceRepositoryProvider).fetchPlans();
});
final profileSubscriptionProvider = FutureProvider<ProfileSubscription?>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(commerceRepositoryProvider).fetchSubscription();
});


class CartController extends Notifier<List<CartLine>> {
  @override
  List<CartLine> build() => const [];

  void add(ShopProduct product) {
    final index = state.indexWhere((line) => line.product.id == product.id);
    if (index < 0) {
      state = [...state, CartLine(product: product, quantity: 1)];
      return;
    }
    final line = state[index];
    if (line.quantity >= product.stock) return;
    state = [...state]..[index] = line.copyWith(quantity: line.quantity + 1);
  }

  void increment(String productId) {
    final index = state.indexWhere((line) => line.product.id == productId);
    if (index < 0) return;
    final line = state[index];
    if (line.quantity >= line.product.stock) return;
    state = [...state]..[index] = line.copyWith(quantity: line.quantity + 1);
  }

  void decrement(String productId) {
    final index = state.indexWhere((line) => line.product.id == productId);
    if (index < 0) return;
    final line = state[index];
    if (line.quantity <= 1) {
      state = [...state]..removeAt(index);
      return;
    }
    state = [...state]..[index] = line.copyWith(quantity: line.quantity - 1);
  }

  void clear() => state = const [];
}

final cartProvider = NotifierProvider<CartController, List<CartLine>>(CartController.new);

extension CartTotals on List<CartLine> {
  int get totalCents => fold(0, (total, line) => total + line.totalCents);
  int get itemCount => fold(0, (total, line) => total + line.quantity);
}
