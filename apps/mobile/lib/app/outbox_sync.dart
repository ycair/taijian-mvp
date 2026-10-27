import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/animals/lineage_repository.dart';
import '../features/animals/transfer_repository.dart';
import '../features/shop/commerce_repository.dart';
import '../features/species/species_repository.dart';
import 'providers.dart';

/// Periodic safety net for the outbox.
///
/// iOS does not guarantee a Dart callback on network change without an extra
/// plugin, so a 30-second retry plus the app-resume hook covers connection
/// restoration. A flush is a cheap local query while the queue is empty.
class OutboxAutoSync extends ConsumerStatefulWidget {
  const OutboxAutoSync({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<OutboxAutoSync> createState() => _OutboxAutoSyncState();
}

class _OutboxAutoSyncState extends ConsumerState<OutboxAutoSync>
    with WidgetsBindingObserver {
  Timer? _timer;

  StreamSubscription<void>? _sentSubscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _flush());
    _sentSubscription = ref.read(outboxProvider).sent.listen((_) => _refreshReads());
  }

  @override
  void dispose() {
    _sentSubscription?.cancel();
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _refreshReads() {
    if (!mounted) return;
    ref.invalidate(appUserProvider);
    ref.invalidate(householdProvider);
    ref.invalidate(householdMembersProvider);
    ref.invalidate(animalsProvider);
    ref.invalidate(recordsProvider);
    ref.invalidate(remindersProvider);
    ref.invalidate(todayCompletionsProvider);
    ref.invalidate(speciesCatalogProvider);
    ref.invalidate(transfersProvider);
    ref.invalidate(lineageProvider);
    ref.invalidate(shopProductsProvider);
    ref.invalidate(shopOrdersProvider);
    ref.invalidate(pointsLedgerProvider);
    ref.invalidate(profileSubscriptionProvider);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _flush();
  }

  void _flush() {
    if (!mounted) return;
    if (ref.read(currentUserProvider) == null) return;
    unawaited(ref.read(outboxProvider).flush());
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
