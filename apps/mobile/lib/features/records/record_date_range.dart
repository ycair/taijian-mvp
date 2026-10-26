import 'package:flutter/material.dart';

import '../../core/time/app_time.dart';

class RecordDateRange {
  const RecordDateRange({required this.start, required this.end});

  final DateTime start;
  final DateTime end;

  DateTime get startDay => DateTime(start.year, start.month, start.day);

  DateTime get endDay => DateTime(end.year, end.month, end.day);

  static RecordDateRange lastDays(int days, {DateTime? now}) {
    final today = now ?? DateTime.now();
    final end = DateTime(today.year, today.month, today.day);
    return RecordDateRange(start: end.subtract(Duration(days: days - 1)), end: end);
  }

  bool get isLast7 => _sameRange(startDay, endDay, 7);
  bool get isLast30 => _sameRange(startDay, endDay, 30);
  bool get isLast90 => _sameRange(startDay, endDay, 90);

  bool _sameRange(DateTime start, DateTime end, int days) {
    final expected = RecordDateRange.lastDays(days);
    return expected.startDay == start && expected.endDay == end;
  }

  String get label {
    String format(DateTime date) =>
        '${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
    return '${format(startDay)} - ${format(endDay)}';
  }

  DateTime startUtc(String timezone) {
    final key = formatDateKey(startDay.year, startDay.month, startDay.day);
    return dueAt(key, '00:00', timezone);
  }

  DateTime endExclusiveUtc(String timezone) {
    final key = formatDateKey(endDay.year, endDay.month, endDay.day);
    return dueAt(shiftDateKey(key, 1), '00:00', timezone);
  }
}

class RecordDateRangeBar extends StatelessWidget {
  const RecordDateRangeBar({
    super.key,
    required this.range,
    required this.onChanged,
  });

  final RecordDateRange range;
  final ValueChanged<RecordDateRange> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        children: [
          for (final days in const [7, 30, 90]) ...[
            ChoiceChip(
              label: Text('$days 天'),
              selected: switch (days) {
                7 => range.isLast7,
                30 => range.isLast30,
                _ => range.isLast90,
              },
              onSelected: (_) => onChanged(RecordDateRange.lastDays(days)),
            ),
            const SizedBox(width: 6),
          ],
          ActionChip(
            avatar: const Icon(Icons.date_range, size: 15),
            label: Text(range.label),
            onPressed: () => _pickRange(context),
          ),
        ],
      ),
    );
  }

  Future<void> _pickRange(BuildContext context) async {
    final picked = await showDateRangePicker(
      context: context,
      initialDateRange: DateTimeRange(start: range.startDay, end: range.endDay),
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
      helpText: '選擇分析日期',
      cancelText: '取消',
      confirmText: '套用',
      saveText: '套用',
      builder: (context, child) => Theme(
        data: Theme.of(context),
        child: child ?? const SizedBox.shrink(),
      ),
    );
    if (picked == null) return;
    onChanged(RecordDateRange(start: picked.start, end: picked.end));
  }
}
