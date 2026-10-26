import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/reminders/notification_plan.dart';
import '../features/reminders/notification_service.dart';
import '../core/models/models.dart';
import 'providers.dart';

/// Reschedules local notifications whenever the signed-in household's care
/// reminders change. Remote push is intentionally not used.
class LocalNotificationSync extends ConsumerStatefulWidget {
  const LocalNotificationSync({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<LocalNotificationSync> createState() => _LocalNotificationSyncState();
}

class _LocalNotificationSyncState extends ConsumerState<LocalNotificationSync> {
  String? _lastKey;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final householdId = ref.watch(householdIdProvider);
    final enabled = ref.watch(notificationSettingsProvider).value;
    final reminders = ref.watch(remindersProvider).value;
    final animals = ref.watch(activeAnimalsProvider);
    final timezone = ref.watch(householdTimezoneProvider);

    final key = user == null
        ? 'signed-out'
        : [
            user.uid,
            householdId ?? 'no-household',
            enabled?.toString() ?? 'settings-loading',
            timezone,
            for (final reminder in reminders ?? const <Reminder>[])
              '${reminder.id}:${reminder.revision}:${reminder.enabled}:${reminder.title}:'
                  '${reminder.type}:${reminder.timezone}:${reminder.animalId}:'
                  '${reminder.schedule.toJson()}',
            for (final animal in animals)
              '${animal.id}:${animal.name}:${animal.status}',
          ].join('|');

    if (key != _lastKey) {
      _lastKey = key;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        unawaited(_sync(
          signedIn: user != null,
          householdId: householdId,
          enabled: enabled,
          reminders: reminders,
          animals: animals,
        ));
      });
    }
    return widget.child;
  }

  Future<void> _sync({
    required bool signedIn,
    required String? householdId,
    required bool? enabled,
    required List<Reminder>? reminders,
    required List<Animal> animals,
  }) async {
    final service = ref.read(notificationServiceProvider);
    if (!signedIn || householdId == null || enabled == null) {
      if (!signedIn) await service.cancelAll();
      return;
    }
    if (!enabled) {
      await service.cancelAll();
      return;
    }
    if (reminders == null) return;
    final byId = {for (final animal in animals) animal.id: animal};
    final plan = buildNotificationPlan(
      reminders: reminders,
      animals: byId,
      now: DateTime.now().toUtc(),
    );
    await service.sync(plan);
  }
}
