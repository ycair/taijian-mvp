import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:realtime_client/realtime_client.dart';

import '../features/animals/lineage_repository.dart';
import '../features/animals/transfer_repository.dart';
import '../features/journal/journal_repository.dart';
import '../features/map/map_repository.dart';
import '../features/proposals/proposals_repository.dart';
import '../features/shop/commerce_repository.dart';
import 'providers.dart';

/// Subscribes to household-scoped Postgres changes. Supabase Realtime is used
/// only while the app is running; the existing polling remains the fallback.
class RealtimeSync extends ConsumerStatefulWidget {
  const RealtimeSync({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<RealtimeSync> createState() => _RealtimeSyncState();
}

class _RealtimeSyncState extends ConsumerState<RealtimeSync> {
  RealtimeClient? _client;
  RealtimeChannel? _channel;
  String? _key;
  Timer? _refreshTimer;
  Timer? _authTimer;

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _authTimer?.cancel();
    _disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final deps = ref.watch(appDependenciesProvider);
    final user = ref.watch(currentUserProvider);
    final householdId = ref.watch(householdIdProvider);
    final key = user == null || householdId == null || deps.rest == null
        ? null
        : '${user.uid}:$householdId';

    if (key != _key) {
      _key = key;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (key == null) {
          _disconnect();
        } else {
          unawaited(_connect(key, user!.uid, householdId!, deps));
        }
      });
    }
    return widget.child;
  }

  Future<void> _connect(String key, String userId, String householdId, dynamic deps) async {
    _disconnect();
    final rest = deps.rest;
    final token = rest?.tokenProvider();
    if (token == null || token.isEmpty) return;
    final config = deps.config;
    final endpoint = config.supabaseUrl.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://');
    try {
      final client = RealtimeClient(
        '$endpoint/realtime/v1',
        params: {'apikey': config.supabaseAnonKey},
        headers: {'apikey': config.supabaseAnonKey},
      );
      await client.setAuth(token);
      final channel = client.channel('household:$householdId');
      void changed(PostgresChangePayload _) => _scheduleRefresh();
      for (final table in const [
        'animals',
        'records',
        'reminders',
        'task_completions',
        'map_zones',
        'animal_positions',
        'shop_orders',
        'journal_entries',
      ]) {
        channel.onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: table,
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'household_id',
            value: householdId,
          ),
          callback: changed,
        );
      }
      for (final table in const ['points_ledger', 'profile_subscriptions']) {
        channel.onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: table,
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'profile_id',
            value: userId,
          ),
          callback: changed,
        );
      }
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'proposals',
        callback: changed,
      );
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'proposal_votes',
        callback: changed,
      );
      channel.subscribe((status, error) {
        if (status == RealtimeSubscribeStatus.channelError) {
          debugPrint('Realtime channel error: $error');
        }
      });
      _client = client;
      _channel = channel;
      _authTimer = Timer.periodic(const Duration(minutes: 45), (_) async {
        final current = rest?.tokenProvider();
        if (current != null && current.isNotEmpty) {
          try {
            await client.setAuth(current);
          } catch (_) {
            // Polling remains active if the socket cannot refresh.
          }
        }
      });
    } catch (error) {
      debugPrint('Realtime connect failed: $error');
    }
  }

  void _scheduleRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer(const Duration(milliseconds: 250), _refreshReads);
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
    ref.invalidate(transfersProvider);
    ref.invalidate(lineageProvider);
    ref.invalidate(shopProductsProvider);
    ref.invalidate(shopOrdersProvider);
    ref.invalidate(pointsLedgerProvider);
    ref.invalidate(profileSubscriptionProvider);
    ref.invalidate(mapZonesProvider);
    ref.invalidate(mapPositionsProvider);
    ref.invalidate(journalEntriesProvider);
    ref.invalidate(proposalsProvider);
  }

  void _disconnect() {
    _authTimer?.cancel();
    _authTimer = null;
    final channel = _channel;
    _channel = null;
    if (channel != null) unawaited(channel.unsubscribe());
    final client = _client;
    _client = null;
    if (client != null) unawaited(client.disconnect());
  }
}
