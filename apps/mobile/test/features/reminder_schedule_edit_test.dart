import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/reminders/reminder_schedule_edit.dart';

void main() {
  test('editing an interval reminder preserves its original start date', () {
    expect(
      intervalStartDate(existingStartDate: '2026-10-01', today: '2026-10-25'),
      '2026-10-01',
    );
  });

  test('a new interval reminder starts today', () {
    expect(intervalStartDate(existingStartDate: null, today: '2026-10-25'), '2026-10-25');
    expect(intervalStartDate(existingStartDate: '  ', today: '2026-10-25'), '2026-10-25');
  });
}
