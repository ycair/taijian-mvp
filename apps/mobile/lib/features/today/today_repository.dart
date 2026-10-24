import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../today/today_engine.dart';

class TodayRepository {
  TodayRepository({required this.commands, required this.householdId});

  final CommandService commands;
  final String? householdId;

  Future<void> complete(TodayTask task) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'task.complete',
      {'reminderId': task.reminderId, 'dueDate': task.dueDate},
      householdId: householdId,
      targetId: 'reminder:${task.reminderId}',
    );
  }

  Future<void> uncomplete(TodayTask task) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'task.uncomplete',
      {'reminderId': task.reminderId, 'dueDate': task.dueDate},
      householdId: householdId,
      targetId: 'reminder:${task.reminderId}',
    );
  }
}

final todayRepositoryProvider = Provider<TodayRepository>((ref) {
  return TodayRepository(
    commands: ref.watch(commandServiceProvider),
    householdId: ref.watch(householdIdProvider),
  );
});
