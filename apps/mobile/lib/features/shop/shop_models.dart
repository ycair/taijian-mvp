import '../../core/models/models.dart';

class ShopProduct {
  const ShopProduct({
    required this.id,
    required this.name,
    required this.description,
    required this.priceCents,
    required this.stock,
    required this.emoji,
    required this.accentColor,
  });

  factory ShopProduct.fromMap(Map<String, dynamic> map) {
    return ShopProduct(
      id: readString(map, 'id'),
      name: readString(map, 'name'),
      description: readString(map, 'description'),
      priceCents: readInt(map, 'priceCents'),
      stock: readInt(map, 'stock'),
      emoji: readString(map, 'emoji', '🌿'),
      accentColor: readString(map, 'accentColor', '#7C9A76'),
    );
  }

  final String id;
  final String name;
  final String description;
  final int priceCents;
  final int stock;
  final String emoji;
  final String accentColor;

  String get priceLabel => 'NT\$ ${(priceCents / 100).toStringAsFixed(0)}';
}

class CartLine {
  const CartLine({required this.product, required this.quantity});

  final ShopProduct product;
  final int quantity;

  int get totalCents => product.priceCents * quantity;

  CartLine copyWith({int? quantity}) => CartLine(product: product, quantity: quantity ?? this.quantity);
}

class ShopOrderItem {
  const ShopOrderItem({
    required this.productId,
    required this.name,
    required this.unitPriceCents,
    required this.quantity,
  });

  factory ShopOrderItem.fromMap(Map<String, dynamic> map) {
    return ShopOrderItem(
      productId: readString(map, 'productId'),
      name: readString(map, 'name'),
      unitPriceCents: readInt(map, 'unitPriceCents'),
      quantity: readInt(map, 'quantity', 1),
    );
  }

  final String productId;
  final String name;
  final int unitPriceCents;
  final int quantity;

  String get totalLabel => 'NT\$ ${(unitPriceCents * quantity / 100).toStringAsFixed(0)}';
}

class ShopOrder {
  const ShopOrder({
    required this.id,
    required this.householdId,
    required this.profileId,
    required this.items,
    required this.subtotalCents,
    required this.pointsUsed,
    required this.totalCents,
    required this.status,
    required this.createdAt,
  });

  factory ShopOrder.fromMap(Map<String, dynamic> map) {
    final rawItems = map['items'];
    final items = rawItems is List
        ? rawItems.whereType<Map>().map((item) => ShopOrderItem.fromMap(Map<String, dynamic>.from(item))).toList()
        : const <ShopOrderItem>[];
    return ShopOrder(
      id: readString(map, 'id'),
      householdId: readString(map, 'householdId'),
      profileId: readString(map, 'profileId'),
      items: items,
      subtotalCents: readInt(map, 'subtotalCents'),
      pointsUsed: readInt(map, 'pointsUsed'),
      totalCents: readInt(map, 'totalCents'),
      status: readString(map, 'status', 'confirmed'),
      createdAt: readDate(map, 'createdAt') ?? DateTime.now().toUtc(),
    );
  }

  final String id;
  final String householdId;
  final String profileId;
  final List<ShopOrderItem> items;
  final int subtotalCents;
  final int pointsUsed;
  final int totalCents;
  final String status;
  final DateTime createdAt;

  String get totalLabel => 'NT\$ ${(totalCents / 100).toStringAsFixed(0)}';

  bool get isCancelled => status == 'cancelled';
}

class PointsEntry {
  const PointsEntry({
    required this.id,
    required this.delta,
    required this.reason,
    required this.createdAt,
  });

  factory PointsEntry.fromMap(Map<String, dynamic> map) {
    return PointsEntry(
      id: readString(map, 'id'),
      delta: readInt(map, 'delta'),
      reason: readString(map, 'reason'),
      createdAt: readDate(map, 'createdAt') ?? DateTime.now().toUtc(),
    );
  }

  final String id;
  final int delta;
  final String reason;
  final DateTime createdAt;

  String get reasonLabel => switch (reason) {
    'check_in' => '每日簽到',
    _ when reason.startsWith('order_cancel:') => '訂單取消退回',
    _ when reason.startsWith('order:') => '購物折抵',
    _ => reason,
  };
}

class SubscriptionPlan {
  const SubscriptionPlan({
    required this.id,
    required this.name,
    required this.monthlyPriceTwd,
    required this.benefits,
  });

  factory SubscriptionPlan.fromMap(Map<String, dynamic> map) {
    final rawBenefits = map['benefits'];
    return SubscriptionPlan(
      id: readString(map, 'id'),
      name: readString(map, 'name'),
      monthlyPriceTwd: readInt(map, 'monthlyPriceTwd'),
      benefits: rawBenefits is List ? rawBenefits.whereType<String>().toList() : const [],
    );
  }

  final String id;
  final String name;
  final int monthlyPriceTwd;
  final List<String> benefits;

  String get priceLabel => 'NT\$ $monthlyPriceTwd / 月';
}

class ProfileSubscription {
  const ProfileSubscription({
    required this.planId,
    required this.status,
    required this.startedAt,
    required this.expiresAt,
    required this.sandbox,
  });

  factory ProfileSubscription.fromMap(Map<String, dynamic> map) {
    return ProfileSubscription(
      planId: readString(map, 'planId'),
      status: readString(map, 'status'),
      startedAt: readDate(map, 'startedAt'),
      expiresAt: readDate(map, 'expiresAt'),
      sandbox: map['sandbox'] != false,
    );
  }

  final String planId;
  final String status;
  final DateTime? startedAt;
  final DateTime? expiresAt;
  final bool sandbox;

  bool get isActive => status == 'active';
}
