import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/command_result.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/data/mock/mock_command_api.dart';
import 'package:mobile/data/mock/mock_store.dart';
import 'package:mobile/data/outbox/outbox.dart';
import 'package:mobile/data/outbox/outbox_database.dart';

void main() {
  setUpAll(initializeTimeZones);

  late MockStore store;
  late MockCommandApi api;
  late OutboxDatabase database;
  late Outbox outbox;

  setUp(() {
    store = MockStore.seeded(now: DateTime.utc(2026, 10, 25, 4, 30));
    api = MockCommandApi(
      store: store,
      uid: () => MockSeed.ownerUid,
      latency: Duration.zero,
    );
    database = OutboxDatabase.withExecutor(NativeDatabase.memory());
    outbox = Outbox(db: database, api: api, uid: () => MockSeed.ownerUid);
  });

  tearDown(() => database.close());

  Map<String, dynamic> updatePayload({required String name}) => {
    'animalId': 'animal_afa',
    'name': name,
  };

  test('replaying the same commandId applies the command once', () async {
    final before = store.animals['animal_afa']!.revision;
    final payload = updatePayload(name: '阿肥二號');
    const commandId = '018f4f7e-0000-7000-8000-000000000001';

    final first = await api.executeCommand(
      'animal.update',
      payload,
      commandId: commandId,
      householdId: MockSeed.householdId,
      baseRevision: before,
    );
    final second = await api.executeCommand(
      'animal.update',
      payload,
      commandId: commandId,
      householdId: MockSeed.householdId,
      baseRevision: before,
    );

    expect(first.ok, isTrue);
    expect(second.ok, isTrue);
    expect(second.revision, first.revision);
    expect(store.animals['animal_afa']!.revision, before + 1);
    expect(store.animals['animal_afa']!.name, '阿肥二號');
  });

  test('outbox flush uses the same commandId and deletes on success', () async {
    final countBefore = store.records.length;
    final occurredAt = DateTime.now().toUtc().toIso8601String();
    final command = await outbox.enqueue(
      'record.create',
      {
        'recordId': '018f4f7e-0000-7000-8000-000000000002',
        'animalId': 'animal_afa',
        'type': 'feeding',
        'occurredAt': occurredAt,
      },
      householdId: MockSeed.householdId,
    );

    final first = await outbox.flush();
    expect(first.sent, 1);
    expect(store.records.length, countBefore + 1);
    expect(await outbox.pendingEntries(), isEmpty);

    // Enqueueing the same command id again (a crash before the local delete, a
    // manual retry) must not duplicate the record: the mock/server idempotency
    // cache returns the original response.
    await outbox.enqueue(
      'record.create',
      {
        'recordId': '018f4f7e-0000-7000-8000-000000000002',
        'animalId': 'animal_afa',
        'type': 'feeding',
        'occurredAt': occurredAt,
      },
      householdId: MockSeed.householdId,
      commandId: command.commandId,
    );
    final second = await outbox.flush();
    expect(second.sent, 1);
    expect(store.records.length, countBefore + 1);
  });

  test('a stale revision becomes a retained conflict, then keepMine wins', () async {
    final animal = store.animals['animal_afa']!;
    // The queued edit was based on revision 0, but the server is at revision 1.
    expect(animal.revision, 1);

    await outbox.enqueue(
      'animal.update',
      updatePayload(name: '我的名字'),
      householdId: MockSeed.householdId,
      baseRevision: 0,
      targetId: 'animal:${animal.id}',
    );

    final first = await outbox.flush();
    expect(first.conflicts, 1);
    expect(first.sent, 0);

    final conflicts = await outbox.watchConflicts().first;
    expect(conflicts, hasLength(1));
    expect(conflicts.single.status, OutboxStatus.conflict);
    expect(conflicts.single.conflictRevision, animal.revision);
    expect(conflicts.single.conflictJson, contains('豹紋守宮'));
    // Nothing was overwritten.
    expect(store.animals['animal_afa']!.name, animal.name);

    final newId = await outbox.keepMine(conflicts.single.commandId);
    expect(newId, isNotNull);

    final sent = await outbox.flush();
    expect(sent.sent, 1);
    expect(store.animals['animal_afa']!.name, '我的名字');
    expect(store.animals['animal_afa']!.revision, animal.revision + 1);
    expect(await outbox.watchConflicts().first, isEmpty);
  });

  test('discard drops a conflict without touching the server', () async {
    final before = store.animals['animal_afa']!;
    await outbox.enqueue(
      'animal.update',
      updatePayload(name: '不要送出'),
      householdId: MockSeed.householdId,
      baseRevision: 0,
    );
    await outbox.flush();
    final conflicts = await outbox.watchConflicts().first;
    expect(conflicts, hasLength(1));

    await outbox.discard(conflicts.single.commandId);
    expect(await outbox.watchConflicts().first, isEmpty);
    expect(store.animals['animal_afa']!.name, before.name);
  });


  test('enqueue during a flush is drained before the flush returns', () async {
    final gated = _GatedApi(store: store, uid: () => MockSeed.ownerUid);
    final queued = Outbox(db: database, api: gated, uid: () => MockSeed.ownerUid);
    final occurredAt = DateTime.now().toUtc().toIso8601String();

    await queued.enqueue(
      'record.create',
      {
        'recordId': '018f4f7e-0000-7000-8000-000000000010',
        'animalId': 'animal_afa',
        'type': 'feeding',
        'occurredAt': occurredAt,
      },
      householdId: MockSeed.householdId,
    );

    final firstFlush = queued.flush();
    await gated.started.future;
    await queued.enqueue(
      'record.create',
      {
        'recordId': '018f4f7e-0000-7000-8000-000000000011',
        'animalId': 'animal_lulu',
        'type': 'water',
        'occurredAt': occurredAt,
      },
      householdId: MockSeed.householdId,
    );
    gated.release.complete();

    final result = await firstFlush;
    expect(result.sent, 2);
    expect(await queued.pendingEntries(), isEmpty);
    expect(
      store.records.where(
        (record) =>
            record.id == '018f4f7e-0000-7000-8000-000000000010' ||
            record.id == '018f4f7e-0000-7000-8000-000000000011',
      ),
      hasLength(2),
    );
  });

  test('manual retry resets attempts and failed rows can be discarded', () async {
    await outbox.enqueue(
      'record.create',
      {
        'recordId': '018f4f7e-0000-7000-8000-000000000012',
        'animalId': 'animal_afa',
        'type': 'mystery-type',
        'occurredAt': DateTime.now().toUtc().toIso8601String(),
      },
      householdId: MockSeed.householdId,
    );
    final flushed = await outbox.flush();
    expect(flushed.failed, 1);

    var rows = await database.select(database.outboxEntries).get();
    expect(rows, hasLength(1));
    expect(rows.single.status, OutboxStatus.failed);
    expect(rows.single.attempts, 1);

    await outbox.retryFailed(rows.single.commandId);
    rows = await database.select(database.outboxEntries).get();
    expect(rows.single.status, OutboxStatus.pending);
    expect(rows.single.attempts, 0);

    await outbox.discard(rows.single.commandId);
    expect(await database.select(database.outboxEntries).get(), isEmpty);
  });

  test('sign-out purge removes all rows for one account only', () async {
    await outbox.enqueue(
      'record.create',
      {
        'recordId': '018f4f7e-0000-7000-8000-000000000013',
        'animalId': 'animal_afa',
        'type': 'feeding',
        'occurredAt': DateTime.now().toUtc().toIso8601String(),
      },
      householdId: MockSeed.householdId,
    );
    final removed = await outbox.purgeForUid(MockSeed.ownerUid);
    expect(removed, 1);
    expect(await database.select(database.outboxEntries).get(), isEmpty);
  });

  test('an empty UID cannot enqueue', () async {
    final anonymous = Outbox(db: database, api: api, uid: () => '');
    await expectLater(
      anonymous.enqueue('task.complete', {'reminderId': 'r', 'dueDate': '2026-10-25'}),
      throwsA(isA<StateError>()),
    );
    expect(await database.select(database.outboxEntries).get(), isEmpty);
  });

  test('a transport failure stays pending for the same commandId', () async {
    final failing = _FlakyApi(store: store, uid: () => MockSeed.ownerUid);
    final flakyOutbox = Outbox(db: database, api: failing, uid: () => MockSeed.ownerUid);
    final command = await flakyOutbox.enqueue(
      'record.create',
      {
        'recordId': '018f4f7e-0000-7000-8000-000000000003',
        'animalId': 'animal_afa',
        'type': 'water',
        'occurredAt': DateTime.now().toUtc().toIso8601String(),
      },
      householdId: MockSeed.householdId,
    );

    failing.failNext = true;
    final failed = await flakyOutbox.flush();
    expect(failed.failed, 1);
    final rows = await flakyOutbox.pendingEntries();
    expect(rows, hasLength(1));
    expect(rows.single.commandId, command.commandId);
    expect(rows.single.status, OutboxStatus.pending);

    final retried = await flakyOutbox.flush();
    expect(retried.sent, 1);
    expect(await flakyOutbox.pendingEntries(), isEmpty);
  });
}

class _FlakyApi extends MockCommandApi {
  _FlakyApi({required super.store, required super.uid}) : super(latency: Duration.zero);

  bool failNext = false;

  @override
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) async {
    if (failNext) {
      failNext = false;
      throw const CommandApiException('offline');
    }
    return super.executeCommand(
      type,
      payload,
      commandId: commandId,
      householdId: householdId,
      baseRevision: baseRevision,
    );
  }
}


class _GatedApi extends MockCommandApi {
  _GatedApi({required super.store, required super.uid}) : super(latency: Duration.zero);

  final Completer<void> started = Completer<void>();
  final Completer<void> release = Completer<void>();
  bool _blockedOnce = false;

  @override
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) async {
    if (!_blockedOnce) {
      _blockedOnce = true;
      started.complete();
      await release.future;
    }
    return super.executeCommand(
      type,
      payload,
      commandId: commandId,
      householdId: householdId,
      baseRevision: baseRevision,
    );
  }
}
