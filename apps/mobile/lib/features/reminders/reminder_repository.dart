import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';

class ReminderRepository {
  ReminderRepository({required this.commands, required this.householdId});

  final CommandService commands;
  final String? householdId;

  Future<void> create({
    required Animal animal,
    required String title,
    required String type,
    required ReminderSchedule schedule,
    required String timezone,
    bool enabled = true,
  }) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'reminder.create',
      {
        'animalId': animal.id,
        'title': title.trim(),
        'type': type,
        'schedule': schedule.toJson(),
        'timezone': timezone,
        'enabled': enabled,
      },
      householdId: householdId,
    );
  }

  Future<void> update({
    required Reminder reminder,
    String? title,
    String? type,
    ReminderSchedule? schedule,
    bool? enabled,
  }) async {
    if (householdId == null) throw StateError('No household');
    final enabledChange = enabled == null || enabled == reminder.enabled ? null : enabled;
    await commands.submit(
      'reminder.update',
      {
        'reminderId': reminder.id,
        if (title != null) 'title': title.trim(),
        'type': ?type,
        if (schedule != null) 'schedule': schedule.toJson(),
        'enabled': ?enabledChange,
      },
      householdId: householdId,
      baseRevision: reminder.revision,
      targetId: 'reminder:${reminder.id}',
    );
  }

  Future<void> delete(Reminder reminder) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'reminder.delete',
      {'reminderId': reminder.id},
      householdId: householdId,
      baseRevision: reminder.revision,
      targetId: 'reminder:${reminder.id}',
    );
  }
}

final reminderRepositoryProvider = Provider<ReminderRepository>((ref) {
  return ReminderRepository(
    commands: ref.watch(commandServiceProvider),
    householdId: ref.watch(householdIdProvider),
  );
});
