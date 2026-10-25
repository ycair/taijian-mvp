import 'package:uuid/uuid.dart';

import '../../core/models/command_result.dart';

const _uuid = Uuid();

/// Client-generated UUIDv7 — sortable and accepted by the server's UUID schema.
String newCommandId() => _uuid.v7();

String newRecordId() => _uuid.v7();

abstract class CommandApi {
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  });
}
