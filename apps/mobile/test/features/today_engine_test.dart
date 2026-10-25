import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/features/today/today_engine.dart';

void main() {
  setUpAll(initializeTimeZones);

  // 2026-10-25 12:30 in Asia/Taipei.
  final now = DateTime.utc(2026, 10, 25, 4, 30);
  const timezone = 'Asia/Taipei';
  const animal = Animal(
    id: 'afa',
    householdId: 'hh',
    name: '阿肥',
    species: 'leopard-gecko',
    speciesLabel: '豹紋守宮',
    avatarColor: '#7C9A76',
    status: 'active',
    revision: 0,
  );
  const archived = Animal(
    id: 'old',
    householdId: 'hh',
    name: '舊居民',
    species: 'other',
    speciesLabel: '其他',
    avatarColor: '#7C9A76',
    status: 'archived',
    revision: 1,
  );

  Reminder reminder({
    required String id,
    required String time,
    required String kind,
    List<int> weekdays = const [],
    String animalId = 'afa',
    bool enabled = true,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? enabledChangedAt,
    List<String> lastChangedFields = const [],
  }) {
    return Reminder(
      id: id,
      householdId: 'hh',
      animalId: animalId,
      title: id,
      type: 'feeding',
      schedule: ReminderSchedule(
        kind: kind,
        times: [time],
        weekdays: weekdays,
        everyNDays: kind == 'interval' ? 2 : null,
        startDate: kind == 'interval' ? '2026-10-25' : null,
      ),
      timezone: timezone,
      enabled: enabled,
      revision: 0,
      createdAt: createdAt,
      updatedAt: updatedAt,
      enabledChangedAt: enabledChangedAt,
      lastChangedFields: lastChangedFields,
    );
  }

  test('builds today occurrences, overdue before upcoming, completed last', () {
    final tasks = TodayEngine.build(
      reminders: [
        reminder(id: '早餐', time: '08:30', kind: 'daily'),
        reminder(id: '晚餐', time: '20:30', kind: 'daily'),
        reminder(id: '巡視', time: '07:00', kind: 'daily'),
      ],
      animals: const [animal],
      completions: [
        const Completion(
          reminderId: '巡視',
          dueDate: '2026-10-25',
          completedBy: 'caretaker',
          completedByName: '阿川',
        ),
      ],
      now: now,
      householdTimezone: timezone,
    );

    expect(tasks.map((task) => task.title).toList(), ['早餐', '晚餐', '巡視']);
    expect(tasks[0].overdue, isTrue);
    expect(tasks[1].overdue, isFalse);
    expect(tasks[2].completed, isTrue);
    expect(tasks[2].completedLabel, '已完成 · 阿川');
    // 08:30 Asia/Taipei is 00:30 UTC.
    expect(tasks[0].dueAt, DateTime.utc(2026, 10, 25, 0, 30));
    expect(tasks[0].clockLabel, '08:30');
  });


  test('an occurrence before the reminder was created is not overdue', () {
    final tasks = TodayEngine.build(
      reminders: [
        reminder(
          id: '早上',
          time: '08:30',
          kind: 'daily',
          // 11:00 Taipei, after the 08:30 slot.
          createdAt: DateTime.utc(2026, 10, 25, 3),
        ),
        reminder(
          id: '晚上',
          time: '20:30',
          kind: 'daily',
          createdAt: DateTime.utc(2026, 10, 25, 3),
        ),
      ],
      animals: const [animal],
      completions: const [],
      now: now,
      householdTimezone: timezone,
    );

    expect(tasks.map((task) => task.title), ['晚上']);
    expect(tasks.single.overdue, isFalse);
  });

  test('re-enabling a reminder uses the explicit re-enable time as the floor', () {
    final tasks = TodayEngine.build(
      reminders: [
        reminder(
          id: '早上',
          time: '08:30',
          kind: 'daily',
          createdAt: DateTime.utc(2026, 10, 1),
          updatedAt: DateTime.utc(2026, 10, 25, 4), // 12:00 Taipei
          enabledChangedAt: DateTime.utc(2026, 10, 25, 4),
          lastChangedFields: const ['enabled', 'nextDueAt', 'enabledChangedAt'],
        ),
        reminder(
          id: '晚上',
          time: '20:30',
          kind: 'daily',
          createdAt: DateTime.utc(2026, 10, 1),
          updatedAt: DateTime.utc(2026, 10, 25, 4),
          enabledChangedAt: DateTime.utc(2026, 10, 25, 4),
          lastChangedFields: const ['enabled', 'nextDueAt', 'enabledChangedAt'],
        ),
      ],
      animals: const [animal],
      completions: const [],
      now: now,
      householdTimezone: timezone,
    );

    expect(tasks.map((task) => task.title), ['晚上']);
  });

  test('a title edit at 14:00 does not hide the 08:30 occurrence', () {
    // 14:00 Taipei. The old client sent enabled unchanged; the old engine
    // treated any 'enabled' in lastChangedFields as a re-enable floor.
    final editTime = DateTime.utc(2026, 10, 25, 6);
    final tasks = TodayEngine.build(
      reminders: [
        reminder(
          id: '未完成的早餐',
          time: '08:30',
          kind: 'daily',
          createdAt: DateTime.utc(2026, 10, 1),
          updatedAt: editTime,
          lastChangedFields: const ['title', 'enabled', 'nextDueAt'],
        ),
        reminder(
          id: '已完成的早餐',
          time: '08:30',
          kind: 'daily',
          createdAt: DateTime.utc(2026, 10, 1),
          updatedAt: editTime,
          lastChangedFields: const ['title', 'enabled', 'nextDueAt'],
        ),
      ],
      animals: const [animal],
      completions: const [
        Completion(
          reminderId: '已完成的早餐',
          dueDate: '2026-10-25',
          completedBy: 'caretaker',
          completedByName: '阿川',
        ),
      ],
      now: editTime,
      householdTimezone: timezone,
    );

    expect(tasks.map((task) => task.title), ['未完成的早餐', '已完成的早餐']);
    expect(tasks.first.overdue, isTrue);
    expect(tasks.last.completed, isTrue);
    expect(tasks.last.completedLabel, '已完成 · 阿川');
  });

  test('a reminder created on a previous day still shows today', () {
    final tasks = TodayEngine.build(
      reminders: [
        reminder(
          id: '早餐',
          time: '08:30',
          kind: 'daily',
          createdAt: DateTime.utc(2026, 10, 20),
        ),
      ],
      animals: const [animal],
      completions: const [],
      now: now,
      householdTimezone: timezone,
    );
    expect(tasks, hasLength(1));
    expect(tasks.single.overdue, isTrue);
  });

  test('a task due later today is not overdue', () {
    final tasks = TodayEngine.build(
      reminders: [reminder(id: '晚餐', time: '20:30', kind: 'daily')],
      animals: const [animal],
      completions: const [],
      now: now,
      householdTimezone: timezone,
    );
    expect(tasks, hasLength(1));
    expect(tasks.single.overdue, isFalse);
    expect(tasks.single.completed, isFalse);
  });

  test('archived animals and disabled reminders never reach Today', () {
    final tasks = TodayEngine.build(
      reminders: [
        reminder(id: '舊居民', time: '08:30', kind: 'daily', animalId: 'old'),
        reminder(id: '已關閉', time: '08:30', kind: 'daily', enabled: false),
      ],
      animals: const [animal, archived],
      completions: const [],
      now: now,
      householdTimezone: timezone,
    );
    expect(tasks, isEmpty);
  });

  test('weekly and interval schedules only appear on their day', () {
    // 2026-10-25 is a Sunday (weekday 7).
    final weekly = TodayEngine.build(
      reminders: [reminder(id: '週一', time: '09:00', kind: 'weekly', weekdays: [1])],
      animals: const [animal],
      completions: const [],
      now: now,
      householdTimezone: timezone,
    );
    expect(weekly, isEmpty);

    final onSunday = TodayEngine.build(
      reminders: [reminder(id: '週日', time: '09:00', kind: 'weekly', weekdays: [7])],
      animals: const [animal],
      completions: const [],
      now: now,
      householdTimezone: timezone,
    );
    expect(onSunday, hasLength(1));

    final interval = TodayEngine.build(
      reminders: [
        Reminder(
          id: '隔天',
          householdId: 'hh',
          animalId: 'afa',
          title: '隔天',
          type: 'feeding',
          schedule: const ReminderSchedule(
            kind: 'interval',
            times: ['09:00'],
            everyNDays: 2,
            startDate: '2026-10-25',
          ),
          timezone: timezone,
          enabled: true,
          revision: 0,
        ),
      ],
      animals: const [animal],
      completions: const [],
      now: now,
      householdTimezone: timezone,
    );
    expect(interval, hasLength(1));
  });

  test('a completion for yesterday does not complete today', () {
    final tasks = TodayEngine.build(
      reminders: [reminder(id: '早餐', time: '08:30', kind: 'daily')],
      animals: const [animal],
      completions: const [
        Completion(reminderId: '早餐', dueDate: '2026-10-24', completedBy: 'owner'),
      ],
      now: now,
      householdTimezone: timezone,
    );
    expect(tasks, hasLength(1));
    expect(tasks.single.completed, isFalse);
    expect(tasks.single.overdue, isTrue);
  });

  test('the completion window spans yesterday to tomorrow', () {
    final window = TodayEngine.completionWindow(now, timezone);
    expect(window.today, '2026-10-25');
    expect(window.from, '2026-10-24');
    expect(window.to, '2026-10-26');
  });
}
