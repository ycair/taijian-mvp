import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/features/reminders/notification_plan.dart';

void main() {
  setUpAll(initializeTimeZones);

  final now = DateTime.utc(2026, 10, 26, 0, 0); // 08:00 Taipei
  const animal = Animal(
    id: 'a1',
    householdId: 'h1',
    name: '阿肥',
    species: 'leopard-gecko',
    speciesLabel: '豹紋守宮',
    avatarColor: '#C9A66B',
    status: 'active',
    revision: 0,
  );
  Reminder reminder(String kind, {String id = 'r1', List<int> weekdays = const []}) {
    return Reminder(
      id: id,
      householdId: 'h1',
      animalId: 'a1',
      title: '餵食',
      type: 'feeding',
      schedule: ReminderSchedule(
        kind: kind,
        times: const ['08:30'],
        weekdays: weekdays,
        everyNDays: kind == 'interval' ? 2 : null,
        startDate: kind == 'interval' ? '2026-10-25' : null,
      ),
      timezone: 'Asia/Taipei',
      enabled: true,
      revision: 1,
      createdAt: DateTime.utc(2026, 10, 1),
    );
  }

  test('daily reminders become one repeating plan', () {
    final plans = buildNotificationPlan(
      reminders: [reminder('daily')],
      animals: const {'a1': animal},
      now: now,
    );
    expect(plans, hasLength(1));
    expect(plans.single.repeat, NotificationRepeat.daily);
    expect(plans.single.scheduledAt, DateTime.utc(2026, 10, 26, 0, 30));
    expect(plans.single.body, contains('阿肥'));
  });

  test('weekly reminders create one repeating plan per selected day', () {
    final plans = buildNotificationPlan(
      reminders: [reminder('weekly', weekdays: [1, 3])],
      animals: const {'a1': animal},
      now: now,
    );
    expect(plans, hasLength(2));
    expect(plans.map((plan) => plan.weekday), [1, 3]);
    expect(plans.every((plan) => plan.repeat == NotificationRepeat.weekly), isTrue);
  });

  test('interval reminders materialize future occurrences', () {
    final plans = buildNotificationPlan(
      reminders: [reminder('interval')],
      animals: const {'a1': animal},
      now: now,
    );
    expect(plans, hasLength(10));
    expect(plans.every((plan) => plan.repeat == NotificationRepeat.none), isTrue);
    expect(plans.first.scheduledAt.isAfter(now), isTrue);
  });

  test('disabled reminders and unavailable residents are skipped', () {
    final disabled = Reminder(
      id: 'r2',
      householdId: 'h1',
      animalId: 'a1',
      title: '餵食',
      type: 'feeding',
      schedule: reminder('daily').schedule,
      timezone: 'Asia/Taipei',
      enabled: false,
      revision: 1,
    );
    final plans = buildNotificationPlan(
      reminders: [disabled],
      animals: const {'a1': animal},
      now: now,
    );
    expect(plans, isEmpty);
    final missing = buildNotificationPlan(
      reminders: [reminder('daily')],
      animals: const {},
      now: now,
    );
    expect(missing, isEmpty);
  });
}
