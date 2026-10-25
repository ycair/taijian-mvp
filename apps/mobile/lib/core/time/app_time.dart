import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// Loads the IANA database. Call once during bootstrap.
void initializeTimeZones() => tz_data.initializeTimeZones();

tz.Location locationFor(String? timezone) {
  if (timezone == null || timezone.isEmpty) return tz.UTC;
  try {
    return tz.getLocation(timezone);
  } catch (_) {
    return tz.UTC;
  }
}

/// Local calendar date (`2026-10-25`) for an instant in a reminder timezone.
String localDateKey(DateTime instant, String timezone) {
  final local = tz.TZDateTime.from(instant.toUtc(), locationFor(timezone));
  return formatDateKey(local.year, local.month, local.day);
}

String formatDateKey(int year, int month, int day) =>
    '${year.toString().padLeft(4, '0')}-'
    '${month.toString().padLeft(2, '0')}-'
    '${day.toString().padLeft(2, '0')}';

/// Shifts a date key by whole days without touching the host timezone.
String shiftDateKey(String dateKey, int days) {
  final parts = dateKey.split('-');
  final year = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 1970;
  final month = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 1;
  final day = int.tryParse(parts.length > 2 ? parts[2] : '') ?? 1;
  final shifted = DateTime.utc(year, month, day).add(Duration(days: days));
  return formatDateKey(shifted.year, shifted.month, shifted.day);
}

/// UTC instant for a local wall-clock time on a date key.
DateTime dueAt(String dateKey, String clock, String timezone) {
  final parts = dateKey.split('-');
  final year = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 1970;
  final month = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 1;
  final day = int.tryParse(parts.length > 2 ? parts[2] : '') ?? 1;
  final clockParts = clock.split(':');
  final hour = int.tryParse(clockParts.isNotEmpty ? clockParts[0] : '') ?? 0;
  final minute = int.tryParse(clockParts.length > 1 ? clockParts[1] : '') ?? 0;
  return tz.TZDateTime(
    locationFor(timezone),
    year,
    month,
    day,
    hour,
    minute,
  ).toUtc();
}

/// Parses Firestore `Timestamp`, ISO strings, millis, and `{seconds, nanos}`.
DateTime? parseDateValue(Object? value) {
  if (value == null) return null;
  if (value is DateTime) return value.toUtc();
  if (value is String) return DateTime.tryParse(value)?.toUtc();
  if (value is int) return DateTime.fromMillisecondsSinceEpoch(value, isUtc: true);
  final dynamic dynamicValue = value;
  try {
    final converted = dynamicValue.toDate();
    if (converted is DateTime) return converted.toUtc();
  } catch (_) {
    // Not a Timestamp; fall through to the map shape.
  }
  if (value is Map) {
    final seconds = value['seconds'] ?? value['_seconds'];
    if (seconds is int) {
      final nanos = value['nanoseconds'] ?? value['_nanoseconds'];
      final millis = seconds * 1000 + ((nanos is int ? nanos : 0) ~/ 1000000);
      return DateTime.fromMillisecondsSinceEpoch(millis, isUtc: true);
    }
  }
  return null;
}

/// `08:30` in the given timezone.
String formatClock(DateTime instant, String timezone) {
  final local = tz.TZDateTime.from(instant.toUtc(), locationFor(timezone));
  return '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

String formatShortDate(DateTime instant, String timezone) {
  final local = tz.TZDateTime.from(instant.toUtc(), locationFor(timezone));
  return '${local.month}/${local.day}';
}

String formatDateTime(DateTime instant, String timezone) {
  final local = tz.TZDateTime.from(instant.toUtc(), locationFor(timezone));
  return '${local.year}/${local.month.toString().padLeft(2, '0')}/'
      '${local.day.toString().padLeft(2, '0')} '
      '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

String weekdayLabel(int weekday) => switch (weekday) {
  1 => '一',
  2 => '二',
  3 => '三',
  4 => '四',
  5 => '五',
  6 => '六',
  _ => '日',
};

int weekdayOf(String dateKey) {
  final parts = dateKey.split('-');
  final year = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 1970;
  final month = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 1;
  final day = int.tryParse(parts.length > 2 ? parts[2] : '') ?? 1;
  return DateTime.utc(year, month, day).weekday;
}

int daysBetweenKeys(String fromKey, String toKey) {
  DateTime parse(String key) {
    final parts = key.split('-');
    return DateTime.utc(
      int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 1970,
      int.tryParse(parts.length > 1 ? parts[1] : '') ?? 1,
      int.tryParse(parts.length > 2 ? parts[2] : '') ?? 1,
    );
  }

  return parse(toKey).difference(parse(fromKey)).inDays;
}
