import 'dart:async';

import '../../core/models/models.dart';
import '../../core/time/app_time.dart';

class MockInvite {
  const MockInvite({
    required this.id,
    required this.token,
    required this.householdId,
    required this.role,
    required this.expiresAt,
  });

  final String id;
  final String token;
  final String householdId;
  final String role;
  final DateTime expiresAt;
}

/// In-memory household state shared by the mock command API and mock reads.
class MockStore {
  MockStore({
    required this.users,
    required this.households,
    required this.members,
    required this.animals,
    required this.records,
    required this.reminders,
    required this.completions,
    required this.invites,
  });

  factory MockStore.seeded({DateTime? now}) {
    final clock = (now ?? DateTime.now()).toUtc();
    final timezone = 'Asia/Taipei';
    final today = localDateKey(clock, timezone);

    final owner = AppUser(
      uid: MockSeed.ownerUid,
      displayName: '小苔',
      locale: 'zh-TW',
      timezone: timezone,
      householdIds: [MockSeed.householdId],
      defaultHouseholdId: MockSeed.householdId,
      isMock: true,
    );
    final caretaker = AppUser(
      uid: MockSeed.caretakerUid,
      displayName: '阿川',
      locale: 'zh-TW',
      timezone: timezone,
      householdIds: [MockSeed.householdId],
      defaultHouseholdId: MockSeed.householdId,
      isMock: true,
    );

    final household = Household(
      id: MockSeed.householdId,
      name: '苔間小屋',
      ownerUid: MockSeed.ownerUid,
      timezone: timezone,
      ownerCount: 1,
      memberCount: 2,
      revision: 3,
    );

    final animals = <String, Animal>{
      'animal_afa': Animal(
        id: 'animal_afa',
        householdId: MockSeed.householdId,
        name: '阿肥',
        species: 'leopard-gecko',
        speciesLabel: '豹紋守宮',
        morph: 'Hypo',
        sex: 'female',
        avatarColor: '#7C9A76',
        status: 'active',
        revision: 1,
        birthDate: '2023-04-12',
      ),
      'animal_lulu': Animal(
        id: 'animal_lulu',
        householdId: MockSeed.householdId,
        name: '小綠',
        species: 'green-horned-frog',
        speciesLabel: '綠角蛙',
        sex: 'unknown',
        avatarColor: '#E8A87C',
        status: 'active',
        revision: 0,
      ),
      'animal_slow': Animal(
        id: 'animal_slow',
        householdId: MockSeed.householdId,
        name: '慢慢',
        species: 'ball-python',
        speciesLabel: '球蟒',
        morph: 'Pastel',
        sex: 'male',
        avatarColor: '#F4D9B0',
        status: 'active',
        revision: 2,
        notes: '冬天會躲在加溫石後面。',
      ),
    };

    final records = <CareRecord>[
      CareRecord(
        id: 'record_1',
        householdId: MockSeed.householdId,
        animalId: 'animal_afa',
        type: RecordType.feeding,
        occurredAt: clock.subtract(const Duration(hours: 6)),
        note: '吃了 3 隻蟋蟀，很有精神。',
      ),
      CareRecord(
        id: 'record_2',
        householdId: MockSeed.householdId,
        animalId: 'animal_afa',
        type: RecordType.weight,
        occurredAt: clock.subtract(const Duration(days: 1, hours: 2)),
        value: 62.4,
        unit: 'g',
      ),
      CareRecord(
        id: 'record_3',
        householdId: MockSeed.householdId,
        animalId: 'animal_lulu',
        type: RecordType.water,
        occurredAt: clock.subtract(const Duration(days: 1, hours: 8)),
      ),
      CareRecord(
        id: 'record_4',
        householdId: MockSeed.householdId,
        animalId: 'animal_slow',
        type: RecordType.shed,
        occurredAt: clock.subtract(const Duration(days: 3)),
        note: '完整蛻皮，眼睛清澈。',
      ),
      CareRecord(
        id: 'record_5',
        householdId: MockSeed.householdId,
        animalId: 'animal_slow',
        type: RecordType.weight,
        occurredAt: clock.subtract(const Duration(days: 5)),
        value: 980,
        unit: 'g',
      ),
    ];

    final reminders = <String, Reminder>{
      'rem_afa_feed': Reminder(
        id: 'rem_afa_feed',
        householdId: MockSeed.householdId,
        animalId: 'animal_afa',
        title: '餵食',
        type: 'feeding',
        schedule: const ReminderSchedule(kind: 'daily', times: ['08:30']),
        timezone: timezone,
        enabled: true,
        revision: 0,
        nextDueAt: dueAt(today, '08:30', timezone),
        createdAt: clock.subtract(const Duration(days: 30)),
        updatedAt: clock.subtract(const Duration(days: 30)),
      ),
      'rem_lulu_water': Reminder(
        id: 'rem_lulu_water',
        householdId: MockSeed.householdId,
        animalId: 'animal_lulu',
        title: '換水',
        type: 'water',
        schedule: const ReminderSchedule(kind: 'daily', times: ['20:30']),
        timezone: timezone,
        enabled: true,
        revision: 0,
        nextDueAt: dueAt(today, '20:30', timezone),
        createdAt: clock.subtract(const Duration(days: 30)),
        updatedAt: clock.subtract(const Duration(days: 30)),
      ),
      'rem_slow_check': Reminder(
        id: 'rem_slow_check',
        householdId: MockSeed.householdId,
        animalId: 'animal_slow',
        title: '巡視環境',
        type: 'note',
        schedule: const ReminderSchedule(kind: 'daily', times: ['07:00']),
        timezone: timezone,
        enabled: true,
        revision: 1,
        nextDueAt: dueAt(today, '07:00', timezone),
        createdAt: clock.subtract(const Duration(days: 30)),
        updatedAt: clock.subtract(const Duration(days: 30)),
      ),
    };

    final completions = <String, Completion>{
      'rem_slow_check:$today': Completion(
        reminderId: 'rem_slow_check',
        dueDate: today,
        completedBy: MockSeed.caretakerUid,
        completedByName: '阿川',
        completedAt: dueAt(today, '07:05', timezone),
      ),
    };

    return MockStore(
      users: {owner.uid: owner, caretaker.uid: caretaker},
      households: {household.id: household},
      members: {
        household.id: [
          HouseholdMember(
            uid: owner.uid,
            role: MemberRole.owner,
            displayName: owner.displayName,
          ),
          HouseholdMember(
            uid: caretaker.uid,
            role: MemberRole.caretaker,
            displayName: caretaker.displayName,
          ),
        ],
      },
      animals: animals,
      records: records,
      reminders: reminders,
      completions: completions,
      invites: {},
    );
  }

  final Map<String, AppUser> users;
  final Map<String, Household> households;
  final Map<String, List<HouseholdMember>> members;
  final Map<String, Animal> animals;
  final List<CareRecord> records;
  final Map<String, Reminder> reminders;
  final Map<String, Completion> completions;
  final Map<String, MockInvite> invites;

  final StreamController<void> _changes = StreamController<void>.broadcast();

  Stream<void> get changes => _changes.stream;

  /// Applies a set of in-memory mutations and emits one change event.
  void mutate(void Function() action) {
    action();
    _changes.add(null);
  }

  Stream<T> watch<T>(T Function() snapshot) async* {
    yield snapshot();
    await for (final _ in _changes.stream) {
      yield snapshot();
    }
  }

  Household? householdForUser(String uid) {
    final user = users[uid];
    if (user == null) return null;
    final selected = user.defaultHouseholdId;
    if (selected != null && households.containsKey(selected)) return households[selected];
    for (final id in user.householdIds) {
      final household = households[id];
      if (household != null) return household;
    }
    return null;
  }

  HouseholdMember? memberOf(String householdId, String uid) {
    for (final member in members[householdId] ?? const <HouseholdMember>[]) {
      if (member.uid == uid) return member;
    }
    return null;
  }

  void dispose() => _changes.close();
}

abstract final class MockSeed {
  static const ownerUid = 'mock_owner';
  static const caretakerUid = 'mock_caretaker';
  static const householdId = 'household_moss';
}
