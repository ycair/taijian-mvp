import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import '../../core/time/schedule_dates.dart';
import '../../core/widgets/common.dart';
import '../records/record_action_tile.dart';

class WeeklyOverviewScreen extends ConsumerStatefulWidget {
  const WeeklyOverviewScreen({super.key});

  @override
  ConsumerState<WeeklyOverviewScreen> createState() => _WeeklyOverviewScreenState();
}

class _WeeklyOverviewScreenState extends ConsumerState<WeeklyOverviewScreen> {
  int _weekOffset = 0;

  @override
  Widget build(BuildContext context) {
    final timezone = ref.watch(householdTimezoneProvider);
    final today = localDateKey(DateTime.now(), timezone);
    final start = shiftDateKey(today, _weekOffset * 7);
    final end = shiftDateKey(start, 6);
    final window = WeekWindow(from: start, to: end);
    final reminders = ref.watch(remindersProvider).value ?? const <Reminder>[];
    final animals = ref.watch(activeAnimalsProvider);
    final completions = ref.watch(weekCompletionsProvider(window)).value ?? const <Completion>[];
    final completionByKey = {for (final completion in completions) completion.key: completion};
    final animalById = {for (final animal in animals) animal.id: animal};

    return Scaffold(
      appBar: AppBar(
        title: const Text('本週提醒'),
        actions: [
          IconButton(
            tooltip: '上一週',
            onPressed: () => setState(() => _weekOffset -= 1),
            icon: const Icon(Icons.chevron_left),
          ),
          IconButton(
            tooltip: '下一週',
            onPressed: () => setState(() => _weekOffset += 1),
            icon: const Icon(Icons.chevron_right),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Text(
            '${_dateLabel(start, timezone)} - ${_dateLabel(end, timezone)}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            _weekOffset == 0 ? '接下來 7 天的照護排程。' : '這一週的照護排程。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          for (var offset = 0; offset < 7; offset += 1)
            _DayCard(
              dateKey: shiftDateKey(start, offset),
              todayKey: today,
              timezone: timezone,
              reminders: reminders,
              animals: animalById,
              completionByKey: completionByKey,
            ),
          if (reminders.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: EmptyState(
                title: '還沒有提醒',
                body: '建立第一個照護提醒，讓每一天都有跡可循。',
                action: FilledButton(
                  onPressed: () => context.push('/reminders/new'),
                  child: const Text('新增提醒'),
                ),
              ),
            ),
        ],
      ),
    );
  }

  static String _dateLabel(String key, String timezone) {
    final parts = key.split('-');
    return '${parts[0]}/${parts[1]}/${parts[2]}';
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({
    required this.dateKey,
    required this.todayKey,
    required this.timezone,
    required this.reminders,
    required this.animals,
    required this.completionByKey,
  });

  final String dateKey;
  final String todayKey;
  final String timezone;
  final List<Reminder> reminders;
  final Map<String, Animal> animals;
  final Map<String, Completion> completionByKey;

  @override
  Widget build(BuildContext context) {
    final entries = <({Reminder reminder, Animal animal, DateTime occurrence, Completion? completion})>[];
    for (final reminder in reminders) {
      if (!reminder.enabled) continue;
      final animal = animals[reminder.animalId];
      if (animal == null) continue;
      final occurrence = scheduleOccurrence(reminder.schedule, dateKey, reminder.timezone);
      if (occurrence == null) continue;
      final completion = completionByKey['${reminder.id}:$dateKey'];
      entries.add((reminder: reminder, animal: animal, occurrence: occurrence, completion: completion));
    }
    entries.sort((a, b) => a.occurrence.compareTo(b.occurrence));
    final isToday = dateKey == todayKey;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: MossCard(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  isToday ? '今天' : '週${weekdayLabel(weekdayOf(dateKey))}',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: isToday ? AppTokens.primaryStrong : AppTokens.ink,
                  ),
                ),
                const SizedBox(width: 8),
                Text(dateKey.substring(5).replaceAll('-', '/'), style: Theme.of(context).textTheme.bodySmall),
                const Spacer(),
                if (entries.isNotEmpty)
                  Text(
                    '${entries.where((entry) => entry.completion != null).length}/${entries.length} 完成',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
            if (entries.isEmpty) ...[
              const SizedBox(height: 8),
              Text('沒有排程', style: Theme.of(context).textTheme.bodySmall),
            ] else
              for (final entry in entries)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    children: [
                      Icon(iconForRecord(_recordType(entry.reminder.type)), size: 17, color: AppTokens.primaryStrong),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${entry.animal.name} · ${entry.reminder.title}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      Text(formatClock(entry.occurrence, entry.reminder.timezone), style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(width: 8),
                      Icon(
                        entry.completion == null ? Icons.radio_button_unchecked : Icons.check_circle,
                        size: 17,
                        color: entry.completion == null ? AppTokens.line : AppTokens.primary,
                      ),
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }

  static RecordType _recordType(String type) {
    return RecordType.tryParse(type) ?? RecordType.note;
  }
}
