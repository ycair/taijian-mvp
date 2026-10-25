import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/providers.dart';
import 'package:mobile/core/models/command_result.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/data/command/command_attempt.dart';
import 'package:mobile/data/command/command_api.dart';
import 'package:mobile/data/mock/mock_command_api.dart';
import 'package:mobile/data/mock/mock_store.dart';
import 'package:mobile/data/outbox/outbox.dart';
import 'package:mobile/data/outbox/outbox_database.dart';
import 'package:mobile/features/household/household_repository.dart';

void main() {
  setUpAll(initializeTimeZones);

  test('a logical attempt keeps its commandId until the payload changes', () {
    final attempt = CommandAttempt();
    final first = attempt.commandIdFor('household.create', {
      'name': '苔間小屋',
      'timezone': 'Asia/Taipei',
    });
    final reordered = attempt.commandIdFor('household.create', {
      'timezone': 'Asia/Taipei',
      'name': '苔間小屋',
    });
    expect(reordered, first);

    final renamed = attempt.commandIdFor('household.create', {
      'name': '另一個家',
      'timezone': 'Asia/Taipei',
    });
    expect(renamed, isNot(first));

    attempt.reset();
    final afterReset = attempt.commandIdFor('household.create', {
      'name': '另一個家',
      'timezone': 'Asia/Taipei',
    });
    expect(afterReset, isNot(renamed));
  });

  test('timeout after commit reuses the commandId and does not create twice', () async {
    final store = MockStore.seeded(now: DateTime.utc(2026, 10, 25, 4, 30));
    final inner = MockCommandApi(
      store: store,
      uid: () => MockSeed.ownerUid,
      latency: Duration.zero,
    );
    final api = _CommitThenTimeoutApi(inner);
    final database = OutboxDatabase.withExecutor(NativeDatabase.memory());
    final outbox = Outbox(db: database, api: api, uid: () => MockSeed.ownerUid);
    addTearDown(() {
      database.close();
      store.dispose();
    });

    final commands = CommandService(outbox: outbox, api: api, autoFlush: false);
    final repository = HouseholdRepository(commands: commands, householdId: null);
    final attempt = CommandAttempt();
    const payloadName = '第二個家';

    final firstId = attempt.commandIdFor('household.create', {
      'name': payloadName,
      'timezone': 'Asia/Taipei',
    });
    await expectLater(
      repository.create(name: payloadName, timezone: 'Asia/Taipei', commandId: firstId),
      throwsA(isA<CommandApiException>()),
    );

    // The retry is the same logical request, so the screen must reuse its id.
    final retryId = attempt.commandIdFor('household.create', {
      'name': payloadName,
      'timezone': 'Asia/Taipei',
    });
    expect(retryId, firstId);
    final result = await repository.create(
      name: payloadName,
      timezone: 'Asia/Taipei',
      commandId: retryId,
    );

    expect(result.ok, isTrue);
    expect(api.commandIds, [firstId, firstId]);
    // Seeded household + exactly one new household, not two.
    expect(store.households, hasLength(2));
    expect(store.households.values.where((household) => household.name == payloadName), hasLength(1));
  });
}

class _CommitThenTimeoutApi implements CommandApi {
  _CommitThenTimeoutApi(this.inner);

  final MockCommandApi inner;
  final List<String> commandIds = [];
  bool _timedOut = false;

  @override
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) async {
    commandIds.add(commandId);
    final result = await inner.executeCommand(
      type,
      payload,
      commandId: commandId,
      householdId: householdId,
      baseRevision: baseRevision,
    );
    if (!_timedOut) {
      _timedOut = true;
      throw const CommandApiException('timeout after commit', code: 'NETWORK');
    }
    return result;
  }
}
