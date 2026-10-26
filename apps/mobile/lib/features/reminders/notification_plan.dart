import 'dart:convert';

import '../../core/models/models.dart';
import '../../core/time/app_time.dart';
import '../../core/time/schedule_dates.dart';

enum NotificationRepeat { none, daily, weekly }

class PlannedNotification {
  const PlannedNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.scheduledAt,
    required this.timezone,
    required this.payload,
    this.repeat = NotificationRepeat.none,
    this.weekday,
  });

  final int id;
  final String title;
  final String body;
  final DateTime scheduledAt;
  final String timezone;
  final String payload;
  final NotificationRepeat repeat;
  final int? weekday;
}

/// Builds the local-notification plan without touching platform APIs.
///
/// Daily and weekly reminders use one repeating iOS notification per time/weekday.
/// Interval reminders cannot be expressed as a native repeating calendar rule,
/// so the next occurrences are materialized, bounded by [maxNotifications].
List<PlannedNotification> buildNotificationPlan({
  required List<Reminder> reminders,
  required Map<String, Animal> animals,
  required DateTime now,
  int maxNotifications = 60,
}) {
  final plans = <PlannedNotification>[];
  for (final reminder in reminders) {
    if (!reminder.enabled) continue;
    final animal = animals[reminder.animalId];
    if (animal == null || !animal.isActive) continue;
    final timezone = reminder.timezone.isEmpty ? 'Asia/Taipei' : reminder.timezone;
    final today = localDateKey(now, timezone);
    final times = reminder.schedule.times.isEmpty
        ? const ['08:30']
        : reminder.schedule.times;

    if (reminder.schedule.kind == 'interval') {
      var count = 0;
      for (var offset = 0; offset <= 370 && count < 10; offset++) {
        final dateKey = shiftDateKey(today, offset);
        if (!scheduleDueOnDate(reminder.schedule, dateKey)) continue;
        for (final time in times) {
          final at = dueAt(dateKey, time, timezone);
          if (!at.isAfter(now)) continue;
          plans.add(_planned(
            reminder,
            animal,
            at,
            timezone,
            slot: 'interval|$dateKey|$time',
          ));
          count += 1;
          if (count >= 10) break;
        }
      }
      continue;
    }

    final weekdays = reminder.schedule.kind == 'weekly'
        ? (reminder.schedule.weekdays.isEmpty ? <int>[] : reminder.schedule.weekdays)
        : const <int>[0];
    for (final weekday in weekdays) {
      for (var offset = 0; offset <= 370; offset++) {
        final dateKey = shiftDateKey(today, offset);
        if (reminder.schedule.kind == 'weekly' && weekdayOf(dateKey) != weekday) {
          continue;
        }
        for (final time in times) {
          final at = dueAt(dateKey, time, timezone);
          if (!at.isAfter(now)) continue;
          plans.add(_planned(
            reminder,
            animal,
            at,
            timezone,
            repeat: reminder.schedule.kind == 'daily'
                ? NotificationRepeat.daily
                : NotificationRepeat.weekly,
            weekday: reminder.schedule.kind == 'weekly' ? weekday : null,
            slot: '${reminder.schedule.kind}|$weekday|$time',
          ));
        }
        break;
      }
    }
  }

  plans.sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
  if (plans.length <= maxNotifications) return plans;
  return plans.take(maxNotifications).toList(growable: false);
}

PlannedNotification _planned(
  Reminder reminder,
  Animal animal,
  DateTime at,
  String timezone, {
  required String slot,
  NotificationRepeat repeat = NotificationRepeat.none,
  int? weekday,
}) {
  return PlannedNotification(
    id: stableNotificationId('${reminder.id}|$slot'),
    title: '苔間 · ${_typeLabel(reminder.type)}',
    body: '${animal.name} · ${reminder.title}',
    scheduledAt: at,
    timezone: timezone,
    payload: jsonEncode({
      'reminderId': reminder.id,
      'animalId': reminder.animalId,
    }),
    repeat: repeat,
    weekday: weekday,
  );
}

int stableNotificationId(String value) {
  var hash = 0x811c9dc5;
  for (final codeUnit in value.codeUnits) {
    hash ^= codeUnit;
    hash = (hash * 0x01000193) & 0x7fffffff;
  }
  return hash == 0 ? 1 : hash;
}

String _typeLabel(String type) => switch (type) {
  'feeding' => '餵食',
  'water' => '換水',
  'weight' => '量體重',
  'poop' => '排便',
  'shed' => '蛻皮',
  'note' => '備註',
  'activity' => '活動',
  'medical' => '醫療',
  'length' => '量身長',
  _ => '照護',
};
