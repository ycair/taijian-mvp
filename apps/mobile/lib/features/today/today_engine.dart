import '../../core/models/models.dart';
import '../../core/time/app_time.dart';
import '../../core/time/schedule_dates.dart';

class TodayTask {
  const TodayTask({
    required this.reminderId,
    required this.animalId,
    required this.animalName,
    required this.title,
    required this.dueDate,
    required this.dueAt,
    required this.timezone,
    this.overdue = false,
    this.completedBy,
    this.completedByName,
    this.pendingCompletion = false,
  });

  final String reminderId;
  final String animalId;
  final String animalName;
  final String title;
  final String dueDate;
  final DateTime dueAt;
  final String timezone;
  final bool overdue;
  final String? completedBy;
  final String? completedByName;

  /// True while a queued `task.complete` is still waiting to be sent.
  final bool pendingCompletion;

  bool get completed => completedBy != null;

  String get clockLabel => formatClock(dueAt, timezone);

  String get completedLabel {
    if (pendingCompletion) return '已完成 · 同步中…';
    final name = completedByName?.trim();
    return name == null || name.isEmpty ? '已完成' : '已完成 · $name';
  }
}

class TodayEngine {
  const TodayEngine._();

  /// Builds today's occurrences from the schedule itself.
  ///
  /// `reminders.nextDueAt` is advanced by the backend scheduler shortly after it
  /// fires, so using it as the sole source would make tasks vanish from Today.
  /// The schedule + stored completion is the stable pair.
  static List<TodayTask> build({
    required List<Reminder> reminders,
    required List<Animal> animals,
    required List<Completion> completions,
    required DateTime now,
    required String householdTimezone,
    int overdueLookbackDays = 0,
    Set<String> pendingCompletionKeys = const {},
  }) {
    final animalById = {
      for (final animal in animals)
        if (animal.isActive) animal.id: animal,
    };
    final completionByKey = {for (final completion in completions) completion.key: completion};
    final tasks = <TodayTask>[];

    for (final reminder in reminders) {
      if (!reminder.enabled) continue;
      final animal = animalById[reminder.animalId];
      if (animal == null) continue;

      final today = localDateKey(now, reminder.timezone);
      for (var offset = -overdueLookbackDays; offset <= 0; offset += 1) {
        final dateKey = shiftDateKey(today, offset);
        final occurrence = scheduleOccurrence(reminder.schedule, dateKey, reminder.timezone);
        if (occurrence == null) continue;

        // Never show an occurrence that predates the reminder itself (or its
        // most recent re-enable). A reminder created at noon must not appear
        // overdue for its 08:30 slot earlier that morning.
        final notBefore = _notBefore(reminder);
        if (notBefore != null && occurrence.isBefore(notBefore)) continue;

        final key = '${reminder.id}:$dateKey';
        final completion = completionByKey[key];
        final pending = completion == null && pendingCompletionKeys.contains(key);
        // Past occurrences only matter when they were missed; one completed long
        // ago should not occupy Today forever.
        if (offset < 0 && (completion != null || pending)) continue;

        final task = TodayTask(
          reminderId: reminder.id,
          animalId: reminder.animalId,
          animalName: animal.name,
          title: reminder.title,
          dueDate: dateKey,
          dueAt: occurrence,
          timezone: reminder.timezone,
          overdue: completion == null && !pending && occurrence.isBefore(now),
          completedBy: completion?.completedBy ?? (pending ? _pendingMarker : null),
          completedByName: completion?.completedByName,
          pendingCompletion: pending,
        );
        tasks.add(task);
      }
    }

    tasks.sort((a, b) {
      if (a.completed != b.completed) return a.completed ? 1 : -1;
      if (a.overdue != b.overdue) return a.overdue ? -1 : 1;
      return a.dueAt.compareTo(b.dueAt);
    });
    return tasks;
  }

  static const _pendingMarker = '__pending__';

  /// The earliest instant this reminder may produce a task.
  ///
  /// Only an explicit server-recorded enable transition moves the floor.
  /// Reading `lastChangedFields` here was wrong: a full-form edit could carry an
  /// unchanged `enabled` key and hide that day's earlier occurrence.
  static DateTime? _notBefore(Reminder reminder) {
    if (reminder.enabled && reminder.enabledChangedAt != null) {
      return reminder.enabledChangedAt;
    }
    return reminder.createdAt;
  }

  /// Completion window read from Firestore: yesterday → tomorrow in the
  /// household timezone, wide enough for late writes and clock skew.
  static ({String today, String from, String to}) completionWindow(
    DateTime now,
    String timezone,
  ) {
    final today = localDateKey(now, timezone);
    return (today: today, from: shiftDateKey(today, -1), to: shiftDateKey(today, 1));
  }
}
