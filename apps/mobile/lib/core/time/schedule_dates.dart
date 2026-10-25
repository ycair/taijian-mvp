import '../models/models.dart';
import 'app_time.dart';

/// Whether a reminder schedule has an occurrence on a local date key.
bool scheduleDueOnDate(ReminderSchedule schedule, String dateKey) {
  switch (schedule.kind) {
    case 'weekly':
      return schedule.weekdays.contains(weekdayOf(dateKey));
    case 'interval':
      final start = schedule.startDate;
      if (start == null) return true;
      final offset = daysBetweenKeys(start, dateKey);
      if (offset < 0) return false;
      final every = schedule.everyNDays ?? 1;
      return every > 0 && offset % every == 0;
    default:
      return true;
  }
}

/// UTC instant for the schedule's occurrence on [dateKey], if any.
DateTime? scheduleOccurrence(ReminderSchedule schedule, String dateKey, String timezone) {
  if (!scheduleDueOnDate(schedule, dateKey)) return null;
  return dueAt(dateKey, schedule.time, timezone);
}

/// Next occurrence strictly after [from], or null when the schedule is empty.
DateTime? nextDueAt(ReminderSchedule schedule, String timezone, DateTime from) {
  final fromKey = localDateKey(from, timezone);
  for (var offset = 0; offset <= 370; offset += 1) {
    final key = shiftDateKey(fromKey, offset);
    final occurrence = scheduleOccurrence(schedule, key, timezone);
    if (occurrence != null && occurrence.isAfter(from)) return occurrence;
  }
  return null;
}
