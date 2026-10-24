import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/providers.dart';
import 'package:mobile/core/models/command_result.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/data/command/command_api.dart';
import 'package:mobile/data/mock/mock_store.dart';
import 'package:mobile/data/outbox/outbox.dart';
import 'package:mobile/data/outbox/outbox_database.dart';
import 'package:mobile/features/animals/animal_repository.dart';
import 'package:mobile/features/household/household_repository.dart';
import 'package:mobile/features/records/record_repository.dart';
import 'package:mobile/features/reminders/reminder_repository.dart';
import 'package:mobile/features/today/today_engine.dart';
import 'package:mobile/features/today/today_repository.dart';
import 'package:timezone/timezone.dart' as tz;

/// Mirrors `packages/domain/src/commands.ts` closely enough to catch payload
/// drift between the iOS client and the Phase 1 command schemas.
void main() {
  setUpAll(initializeTimeZones);

  late MockStore store;
  late OutboxDatabase database;
  late _RecordingApi api;
  late CommandService commands;

  setUp(() {
    store = MockStore.seeded(now: DateTime.utc(2026, 10, 25, 4, 30));
    database = OutboxDatabase.withExecutor(NativeDatabase.memory());
    api = _RecordingApi();
    final outbox = Outbox(db: database, api: api, uid: () => MockSeed.ownerUid);
    commands = CommandService(outbox: outbox, api: api, autoFlush: false);
  });

  tearDown(() {
    database.close();
    store.dispose();
  });

  test('queued payloads satisfy the Phase 1 command contract', () async {
    final animals = AnimalRepository(commands: commands, householdId: MockSeed.householdId);
    final records = RecordRepository(commands: commands, householdId: MockSeed.householdId);
    final reminders = ReminderRepository(commands: commands, householdId: MockSeed.householdId);
    final today = TodayRepository(commands: commands, householdId: MockSeed.householdId);
    final household = HouseholdRepository(
      commands: commands,
      householdId: MockSeed.householdId,
    );

    const animal = Animal(
      id: 'animal_afa',
      householdId: MockSeed.householdId,
      name: '阿肥',
      species: 'leopard-gecko',
      speciesLabel: '豹紋守宮',
      avatarColor: '#7C9A76',
      status: 'active',
      revision: 3,
      morph: 'Hypo',
    );
    const schedule = ReminderSchedule(
      kind: 'interval',
      times: ['09:00'],
      everyNDays: 2,
      startDate: '2026-10-01',
    );
    final reminder = Reminder(
      id: 'rem_afa_feed',
      householdId: MockSeed.householdId,
      animalId: animal.id,
      title: '餵食',
      type: 'feeding',
      schedule: schedule,
      timezone: 'Asia/Taipei',
      enabled: true,
      revision: 1,
      createdAt: DateTime.utc(2026, 10, 1),
      updatedAt: DateTime.utc(2026, 10, 1),
    );
    final now = DateTime.now().toUtc();

    await animals.create(
      name: '阿肥',
      speciesId: 'leopard-gecko',
      avatarColor: '#7C9A76',
      morph: 'Hypo',
      sex: 'female',
      notes: '喜歡躲在水盆後面',
      birthDate: '2023-04-12',
    );
    await animals.update(animal: animal, name: '阿肥', morph: 'Hypo', notes: '換皮中');
    await animals.archive(animal);
    await animals.delete(animal);
    await records.create(
      animalId: animal.id,
      type: RecordType.weight,
      occurredAt: now,
      value: 62.4,
      unit: 'g',
      note: '飯後量測',
    );
    await reminders.create(
      animal: animal,
      title: '餵食',
      type: 'feeding',
      schedule: schedule,
      timezone: 'Asia/Taipei',
    );
    await reminders.create(
      animal: animal,
      title: '換水',
      type: 'water',
      schedule: const ReminderSchedule(
        kind: 'weekly',
        times: ['20:30'],
        weekdays: [1, 3, 5],
      ),
      timezone: 'Asia/Taipei',
    );
    await reminders.update(reminder: reminder, title: '餵食', schedule: schedule, enabled: true);
    await reminders.delete(reminder);
    await today.complete(
      TodayTask(
        reminderId: reminder.id,
        animalId: animal.id,
        animalName: animal.name,
        title: reminder.title,
        dueDate: '2026-10-25',
        dueAt: DateTime.utc(2026, 10, 25, 0, 30),
        timezone: 'Asia/Taipei',
      ),
    );
    await household.updateName(name: '苔間新家', revision: 2);
    await household.updateTimezone(timezone: 'Asia/Tokyo', revision: 3);
    await household.updateProfile(displayName: '小苔', timezone: 'Asia/Taipei');
    await household.updateProfile(defaultHouseholdId: MockSeed.householdId);

    final createResult = await household.create(
      name: '第二個家',
      timezone: 'Asia/Taipei',
      commandId: newCommandId(),
    );
    expect(createResult.ok, isFalse);
    try {
      await household.createInvite(commandId: newCommandId());
      fail('the recording API never returns a token');
    } on CommandException {
      // Expected; the payload was still recorded before the failure.
    }

    final rows = await database.select(database.outboxEntries).get();
    expect(rows, isNotEmpty);
    for (final row in rows) {
      expect(
        row.commandId,
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            caseSensitive: false,
          ),
        ),
      );
      final payload = Map<String, dynamic>.from(jsonDecode(row.payloadJson) as Map);
      switch (row.type) {
        case 'animal.create':
          _id(payload['name']);
          expect((payload['name'] as String).length, lessThanOrEqualTo(40));
          _id(payload['species']);
          _enum(payload['sex'], {'male', 'female', 'unknown'});
          _color(payload['avatarColor']);
          _optionalString(payload['speciesLabel'], 60);
          _optionalString(payload['morph'], 60);
          _optionalString(payload['notes'], 2000);
          _date(payload['birthDate']);
        case 'animal.update':
          _id(payload['animalId']);
          expect(row.baseRevision, isNotNull);
          _id(payload['name']);
          _optionalString(payload['morph'], 60);
          _optionalString(payload['notes'], 2000);
        case 'animal.archive':
        case 'animal.delete':
          _id(payload['animalId']);
          expect(row.baseRevision, isNotNull);
        case 'record.create':
          _uuid(payload['recordId']);
          _id(payload['animalId']);
          _enum(payload['type'], {
            'feeding',
            'water',
            'weight',
            'poop',
            'shed',
            'activity',
            'medical',
            'note',
            'custom',
          });
          final occurredAt = DateTime.tryParse(payload['occurredAt'] as String? ?? '');
          expect(occurredAt, isNotNull);
          expect(occurredAt!.isBefore(now.subtract(const Duration(days: 366))), isFalse);
          expect(occurredAt.isAfter(now.add(const Duration(minutes: 6))), isFalse);
          if (payload['value'] != null) {
            expect(payload['value'], isA<num>());
            final value = (payload['value'] as num).toDouble();
            expect(value, inInclusiveRange(0, 1000000));
          }
          _optionalString(payload['unit'], 16);
          _optionalString(payload['note'], 1000);
        case 'reminder.create':
          _id(payload['animalId']);
          _id(payload['title']);
          expect((payload['title'] as String).length, lessThanOrEqualTo(60));
          _id(payload['type']);
          _schedule(payload['schedule']);
          _timezone(payload['timezone']);
          expect(payload['enabled'], isA<bool>());
        case 'reminder.update':
          _id(payload['reminderId']);
          expect(row.baseRevision, isNotNull);
          _schedule(payload['schedule']);
          if (payload['enabled'] != null) expect(payload['enabled'], isA<bool>());
        case 'reminder.delete':
          _id(payload['reminderId']);
          expect(row.baseRevision, isNotNull);
        case 'task.complete':
          _id(payload['reminderId']);
          _date(payload['dueDate']);
        case 'household.update':
          expect(payload['name'] != null || payload['timezone'] != null, isTrue);
          if (payload['name'] != null) _id(payload['name']);
          if (payload['timezone'] != null) _timezone(payload['timezone']);
          expect(row.baseRevision, isNotNull);
        case 'user.updateProfile':
          if (payload['displayName'] != null) _id(payload['displayName']);
          if (payload['timezone'] != null) _timezone(payload['timezone']);
          if (payload['defaultHouseholdId'] != null) _id(payload['defaultHouseholdId']);
        default:
          fail('unexpected queued command ${row.type}');
      }
    }

    final commandTypes = api.calls.map((call) => call.type).toSet();
    expect(commandTypes, containsAll(['household.create', 'member.invite']));
    final createCall = api.calls.firstWhere((call) => call.type == 'household.create');
    _id(createCall.payload['name']);
    _timezone(createCall.payload['timezone']);
    final inviteCall = api.calls.firstWhere((call) => call.type == 'member.invite');
    expect(inviteCall.payload['role'], 'caretaker');
    expect(inviteCall.payload['expiresInDays'], inInclusiveRange(1, 30));
  });
}

void _id(Object? value) {
  expect(value, isA<String>());
  final text = value! as String;
  expect(text.trim(), isNotEmpty);
  expect(text.length, lessThanOrEqualTo(128));
}

void _uuid(Object? value) {
  expect(
    value,
    matches(
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        caseSensitive: false,
      ),
    ),
  );
}

void _date(Object? value) {
  final text = value as String?;
  expect(text, isNotNull);
  expect(text, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
  expect(DateTime.tryParse(text!), isNotNull);
}

void _clock(Object? value) {
  expect(value, matches(RegExp(r'^([01]\d|2[0-3]):[0-5]\d$')));
}

void _timezone(Object? value) {
  expect(value, isA<String>());
  expect(() => tz.getLocation(value! as String), returnsNormally);
}

void _enum(Object? value, Set<String> allowed) {
  expect(value, isA<String>());
  expect(allowed, contains(value));
}

void _color(Object? value) {
  expect(value, matches(RegExp(r'^#[0-9A-Fa-f]{6}$')));
}

void _optionalString(Object? value, int maxLength) {
  if (value == null) return;
  expect(value, isA<String>());
  expect((value as String).length, lessThanOrEqualTo(maxLength));
}

void _schedule(Object? value) {
  expect(value, isA<Map>());
  final schedule = Map<String, dynamic>.from(value! as Map);
  final kind = schedule['kind'];
  expect(kind, isIn(['daily', 'weekly', 'interval']));
  expect(schedule['times'], isA<List>());
  final times = schedule['times']! as List;
  expect(times, hasLength(1));
  _clock(times.single);
  if (kind == 'weekly') {
    expect(schedule['weekdays'], isA<List>());
    final weekdays = schedule['weekdays']! as List;
    expect(weekdays, isNotEmpty);
    for (final day in weekdays) {
      expect(day, isA<num>());
      expect((day as num).toInt(), inInclusiveRange(1, 7));
    }
  }
  if (kind == 'interval') {
    expect(schedule['everyNDays'], isA<num>());
    expect((schedule['everyNDays'] as num).toInt(), inInclusiveRange(1, 365));
    _date(schedule['startDate']);
  }
}

class _Call {
  const _Call({
    required this.type,
    required this.payload,
    required this.commandId,
    required this.householdId,
    required this.baseRevision,
  });

  final String type;
  final Map<String, dynamic> payload;
  final String commandId;
  final String? householdId;
  final int? baseRevision;
}

class _RecordingApi implements CommandApi {
  final List<_Call> calls = [];

  @override
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) async {
    calls.add(
      _Call(
        type: type,
        payload: payload,
        commandId: commandId,
        householdId: householdId,
        baseRevision: baseRevision,
      ),
    );
    return CommandResult.failure(
      commandId: commandId,
      code: 'NETWORK',
      message: 'offline',
    );
  }
}
