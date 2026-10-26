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
    Map<String, dynamic> metadata = const {},
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
        if (metadata.isNotEmpty) 'metadata': metadata,
      },
      householdId: householdId,
      targetId: 'record:$recordId',
    );
    return recordId;
  }

  Future<void> update({
    required CareRecord record,
    required RecordType type,
    required DateTime occurredAt,
    double? value,
    String? unit,
    String? note,
    Map<String, dynamic> metadata = const {},
  }) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'record.update',
      {
        'recordId': record.id,
        'type': type.name,
        'occurredAt': occurredAt.toUtc().toIso8601String(),
        'value': value,
        'unit': unit ?? '',
        'note': note ?? '',
        'metadata': metadata,
      },
      householdId: householdId,
      baseRevision: record.revision,
      targetId: 'record:${record.id}',
    );
  }

  Future<void> delete(CareRecord record) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'record.delete',
      {'recordId': record.id},
      householdId: householdId,
      baseRevision: record.revision,
      targetId: 'record:${record.id}',
    );
  }
}

final recordRepositoryProvider = Provider<RecordRepository>((ref) {
  return RecordRepository(
    commands: ref.watch(commandServiceProvider),
    householdId: ref.watch(householdIdProvider),
  );
});
