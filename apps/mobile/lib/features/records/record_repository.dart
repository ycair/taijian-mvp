import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../data/command/command_api.dart';

class RecordRepository {
  RecordRepository({required this.commands, required this.householdId});

  final CommandService commands;
  final String? householdId;

  Future<String> create({
    required String animalId,
    required RecordType type,
    required DateTime occurredAt,
    double? value,
    String? unit,
    String? note,
  }) async {
    if (householdId == null) throw StateError('No household');
    final recordId = newRecordId();
    await commands.submit(
      'record.create',
      {
        'recordId': recordId,
        'animalId': animalId,
        'type': type.name,
        'occurredAt': occurredAt.toUtc().toIso8601String(),
        'value': ?value,
        if (unit != null && unit.isNotEmpty) 'unit': unit,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
      householdId: householdId,
      targetId: 'record:$recordId',
    );
    return recordId;
  }
}

final recordRepositoryProvider = Provider<RecordRepository>((ref) {
  return RecordRepository(
    commands: ref.watch(commandServiceProvider),
    householdId: ref.watch(householdIdProvider),
  );
});
