import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';

import '../../core/models/command_result.dart';
import '../command/command_api.dart';
import 'outbox_database.dart';

class QueuedCommand {
  const QueuedCommand({
    required this.commandId,
    required this.type,
    required this.payload,
    this.householdId,
    this.baseRevision,
    this.targetId,
  });

  final String commandId;
  final String type;
  final Map<String, dynamic> payload;
  final String? householdId;
  final int? baseRevision;
  final String? targetId;
}

class OutboxFlushResult {
  const OutboxFlushResult({
    this.sent = 0,
    this.conflicts = 0,
    this.failed = 0,
    this.remaining = 0,
  });

  final int sent;
  final int conflicts;
  final int failed;
  final int remaining;

  bool get hasProblems => conflicts > 0 || failed > 0;
}

/// Durable, idempotent command queue.
///
/// A retry always reuses the same `commandId`; the server's idempotency cache
/// then makes a timeout-after-commit replay safe. A revision conflict is kept
/// (not dropped) so the UI can offer「查看最新」/「保留我的」.
class Outbox {
  Outbox({
    required this.db,
    required this.api,
    required this.uid,
    this.maxAttempts = 5,
  });

  final OutboxDatabase db;
  final CommandApi api;
  final String Function() uid;
  final int maxAttempts;

  bool _flushing = false;
  bool _rerunRequested = false;
  final _sentController = StreamController<void>.broadcast();

  /// Emits after a command is accepted and removed from the queue.
  Stream<void> get sent => _sentController.stream;

  Future<QueuedCommand> enqueue(
    String type,
    Map<String, dynamic> payload, {
    String? householdId,
    int? baseRevision,
    String? targetId,
    String? commandId,
  }) async {
    final currentUid = uid();
    if (currentUid.isEmpty) {
      throw StateError('Cannot queue a command without a signed-in user');
    }
    final id = commandId ?? newCommandId();
    final command = QueuedCommand(
      commandId: id,
      type: type,
      payload: payload,
      householdId: householdId,
      baseRevision: baseRevision,
      targetId: targetId,
    );
    await db
        .into(db.outboxEntries)
        .insert(
          OutboxEntriesCompanion.insert(
            commandId: id,
            uid: currentUid,
            type: type,
            householdId: Value(householdId),
            targetId: Value(targetId),
            baseRevision: Value(baseRevision),
            payloadJson: jsonEncode(payload),
            status: const Value(OutboxStatus.pending),
            createdAt: DateTime.now().toUtc(),
          ),
          mode: InsertMode.insertOrIgnore,
        );
    // A row inserted after the current pass took its snapshot must be drained
    // before the active flush returns.
    if (_flushing) _rerunRequested = true;
    return command;
  }

  Stream<List<OutboxEntry>> watchEntries() {
    final query = db.select(db.outboxEntries)
      ..where((row) => row.uid.equals(uid()))
      ..orderBy([(row) => OrderingTerm(expression: row.createdAt)]);
    return query.watch();
  }

  Stream<List<OutboxEntry>> watchConflicts() {
    final query = db.select(db.outboxEntries)
      ..where((row) => row.uid.equals(uid()) & row.status.equals(OutboxStatus.conflict))
      ..orderBy([(row) => OrderingTerm(expression: row.createdAt)]);
    return query.watch();
  }

  Future<List<OutboxEntry>> pendingEntries() {
    final query = db.select(db.outboxEntries)
      ..where(
        (row) =>
            row.uid.equals(uid()) &
            (row.status.equals(OutboxStatus.pending) | row.status.equals(OutboxStatus.sending)),
      )
      ..orderBy([(row) => OrderingTerm(expression: row.createdAt)]);
    return query.get();
  }

  /// Sends queued commands sequentially. Concurrent callers share one flush.
  ///
  /// If a command is enqueued while a pass is running, the pass sets a rerun
  /// flag and drains the new row before this future completes. A retryable
  /// network failure stops the loop so a flaky connection is not hammered.
  Future<OutboxFlushResult> flush() async {
    if (_flushing) {
      _rerunRequested = true;
      return const OutboxFlushResult();
    }
    _flushing = true;
    var sent = 0;
    var conflicts = 0;
    var failed = 0;
    var stopForTransport = false;
    try {
      do {
        _rerunRequested = false;
        final rows = await pendingEntries();
        for (final row in rows) {
          if (row.uid != uid()) continue;
          await (db.update(db.outboxEntries)..where((r) => r.commandId.equals(row.commandId))).write(
            const OutboxEntriesCompanion(status: Value(OutboxStatus.sending)),
          );

          Map<String, dynamic> payload;
          try {
            payload = Map<String, dynamic>.from(jsonDecode(row.payloadJson) as Map);
          } catch (_) {
            await _markFailed(row, 'invalid payload json');
            failed += 1;
            continue;
          }

          try {
            final result = await api.executeCommand(
              row.type,
              payload,
              commandId: row.commandId,
              householdId: row.householdId,
              baseRevision: row.baseRevision,
            );
            if (result.ok) {
              await (db.delete(db.outboxEntries)..where((r) => r.commandId.equals(row.commandId))).go();
              _sentController.add(null);
              sent += 1;
            } else if (result.isConflict) {
              await (db.update(db.outboxEntries)..where((r) => r.commandId.equals(row.commandId))).write(
                OutboxEntriesCompanion(
                  status: const Value(OutboxStatus.conflict),
                  attempts: Value(row.attempts + 1),
                  lastError: Value(result.message),
                  conflictJson: Value(result.current == null ? null : jsonEncode(result.current)),
                  conflictRevision: Value(result.currentRevision),
                ),
              );
              conflicts += 1;
            } else {
              final retryable = _retryableCode(result.code);
              final attempts = row.attempts + 1;
              final status = retryable && attempts < maxAttempts
                  ? OutboxStatus.pending
                  : OutboxStatus.failed;
              await (db.update(db.outboxEntries)..where((r) => r.commandId.equals(row.commandId))).write(
                OutboxEntriesCompanion(
                  status: Value(status),
                  attempts: Value(attempts),
                  lastError: Value(result.message ?? result.code),
                ),
              );
              failed += 1;
              // A transport/rate-limit failure will likely hit the same wall
              // for the next row; stop this pass and retry on the next trigger.
              if (retryable) {
                stopForTransport = true;
                break;
              }
            }
          } on CommandApiException catch (error) {
            final attempts = row.attempts + 1;
            final status = error.retryable && attempts < maxAttempts
                ? OutboxStatus.pending
                : OutboxStatus.failed;
            await (db.update(db.outboxEntries)..where((r) => r.commandId.equals(row.commandId))).write(
              OutboxEntriesCompanion(
                status: Value(status),
                attempts: Value(attempts),
                lastError: Value(error.message),
              ),
            );
            failed += 1;
            if (error.retryable) {
              stopForTransport = true;
              break;
            }
          } catch (error) {
            await (db.update(db.outboxEntries)..where((r) => r.commandId.equals(row.commandId))).write(
              const OutboxEntriesCompanion(
                status: Value(OutboxStatus.pending),
                lastError: Value('unexpected command failure'),
              ),
            );
            failed += 1;
            stopForTransport = true;
            break;
          }
        }
      } while (!stopForTransport && _rerunRequested);
    } finally {
      _flushing = false;
    }

    final remaining = (await pendingEntries()).length;
    return OutboxFlushResult(
      sent: sent,
      conflicts: conflicts,
      failed: failed,
      remaining: remaining,
    );
  }

  Future<void> discard(String commandId) async {
    await (db.delete(db.outboxEntries)
          ..where((row) => row.commandId.equals(commandId) & row.uid.equals(uid())))
        .go();
  }

  /// Removes every queued row owned by [ownerUid] (sign-out privacy cleanup).
  Future<int> purgeForUid(String ownerUid) {
    return (db.delete(db.outboxEntries)..where((row) => row.uid.equals(ownerUid))).go();
  }

  /// "保留我的": re-read the latest revision from the conflict response, keep the
  /// local payload, and resubmit under a fresh commandId.
  Future<String?> keepMine(String commandId) async {
    final row = await (db.select(db.outboxEntries)
          ..where((entry) => entry.commandId.equals(commandId) & entry.uid.equals(uid())))
        .getSingleOrNull();
    if (row == null || row.conflictRevision == null) return null;
    Map<String, dynamic> payload;
    try {
      payload = Map<String, dynamic>.from(jsonDecode(row.payloadJson) as Map);
    } catch (_) {
      return null;
    }
    final newId = newCommandId();
    await db.transaction(() async {
      await (db.delete(db.outboxEntries)..where((entry) => entry.commandId.equals(commandId))).go();
      await db
          .into(db.outboxEntries)
          .insert(
            OutboxEntriesCompanion.insert(
              commandId: newId,
              uid: row.uid,
              type: row.type,
              householdId: Value(row.householdId),
              targetId: Value(row.targetId),
              baseRevision: Value(row.conflictRevision),
              payloadJson: jsonEncode(payload),
              status: const Value(OutboxStatus.pending),
              createdAt: DateTime.now().toUtc(),
            ),
          );
    });
    return newId;
  }

  Future<void> retryFailed(String commandId) async {
    await (db.update(db.outboxEntries)
          ..where((row) => row.commandId.equals(commandId) & row.uid.equals(uid())))
        .write(
          const OutboxEntriesCompanion(
            status: Value(OutboxStatus.pending),
            attempts: Value(0),
            lastError: Value(null),
          ),
        );
  }

  Future<void> _markFailed(OutboxEntry row, String error) async {
    await (db.update(db.outboxEntries)..where((r) => r.commandId.equals(row.commandId))).write(
      OutboxEntriesCompanion(
        status: const Value(OutboxStatus.failed),
        attempts: Value(row.attempts + 1),
        lastError: Value(error),
      ),
    );
  }

  static bool _retryableCode(String? code) =>
      code == 'NETWORK' || code == 'RATE_LIMITED' || code == 'INTERNAL';

  void dispose() => db.close();
}
