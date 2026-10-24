import 'dart:convert';

import 'command_api.dart';

/// A client-side logical command attempt.
///
/// Online-only commands (`household.create`, `member.invite`) need a stable
/// `commandId` while the user retries the same intent: if the first request
/// committed but its response was lost, the replay must hit the server's
/// idempotency cache instead of creating a second household/invite.
///
/// A changed payload is a new intent, so it gets a new id. Call [reset] after a
/// successful response so a deliberate later action starts a fresh command.
class CommandAttempt {
  String? _commandId;
  String? _signature;

  String? get commandId => _commandId;

  String commandIdFor(String type, Map<String, dynamic> payload) {
    final signature = jsonEncode({'type': type, 'payload': _canonical(payload)});
    final existing = _commandId;
    if (existing != null && _signature == signature) return existing;
    final next = newCommandId();
    _commandId = next;
    _signature = signature;
    return next;
  }

  void reset() {
    _commandId = null;
    _signature = null;
  }

  static Object? _canonical(Object? value) {
    if (value is Map) {
      final keys = value.keys.map((key) => key.toString()).toList()..sort();
      return {for (final key in keys) key: _canonical(value[key])};
    }
    if (value is List) return value.map(_canonical).toList();
    return value;
  }
}
