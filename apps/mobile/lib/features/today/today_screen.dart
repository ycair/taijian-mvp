import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import '../../core/widgets/common.dart';
import 'task_row.dart';
import 'today_engine.dart';
import 'today_repository.dart';

class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen> with WidgetsBindingObserver {
  Timer? _timer;
  String? _busyKey;
  late String _dateKey;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _dateKey = localDateKey(DateTime.now(), ref.read(householdTimezoneProvider));
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (!mounted) return;
      _refreshDateBoundary();
      // Recompute overdue/upcoming every minute; the completion window only
      // changes when the local date key changes.
      ref.invalidate(todayTasksProvider);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(outboxProvider).flush());
    });
  }

  void _refreshDateBoundary() {
    final nextKey = localDateKey(DateTime.now(), ref.read(householdTimezoneProvider));
    if (nextKey == _dateKey) return;
    _dateKey = nextKey;
    ref.invalidate(todayCompletionsProvider);
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(ref.read(outboxProvider).flush());
      _refreshDateBoundary();
      ref.invalidate(todayTasksProvider);
    }
  }

  Future<void> _complete(TodayTask task) async {
    final key = '${task.reminderId}:${task.dueDate}';
    if (_busyKey != null) return;
    setState(() => _busyKey = key);
    try {
      await ref.read(todayRepositoryProvider).complete(task);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已記錄完成，會自動同步到家庭。')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('無法完成任務：$error')));
    } finally {
      if (mounted) setState(() => _busyKey = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(appUserProvider).value;
    final household = ref.watch(householdProvider).value;
    final householdId = ref.watch(householdIdProvider);
    final tasks = ref.watch(todayTasksProvider);
    final animals = ref.watch(activeAnimalsProvider);
    final timezone = ref.watch(householdTimezoneProvider);
    final now = DateTime.now();

    if (householdId == null) {
      return SafeArea(
        child: Column(
          children: [
            const PageHeader(kicker: 'Today', title: '歡迎來到苔間'),
            Expanded(
              child: EmptyState(
                title: '還沒有家庭',
                body: '建立一個家庭，邀請家人一起照顧居民。',
                action: FilledButton(
                  onPressed: () => context.push('/household/new'),
                  child: const Text('建立家庭'),
                ),
              ),
            ),
          ],
        ),
      );
    }

    final overdue = <TodayTask>[];
    final upcoming = <TodayTask>[];
    final done = <TodayTask>[];
    for (final task in tasks.value ?? const <TodayTask>[]) {
      if (task.completed) {
        done.add(task);
      } else if (task.overdue) {
        overdue.add(task);
      } else {
        upcoming.add(task);
      }
    }

    return SafeArea(
      child: RefreshIndicator(
        color: AppTokens.primary,
        onRefresh: () async {
          await ref.read(outboxProvider).flush();
          ref.invalidate(todayTasksProvider);
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            PageHeader(
              kicker: 'Today',
              title: '${_greeting(now)}，${user?.displayName ?? '苔友'}。',
              subtitle: '${household?.name ?? '我的家庭'} · ${_dateLabel(now, timezone)}',
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: '旅程',
                    onPressed: () => context.push('/journal'),
                    icon: const Icon(Icons.menu_book_outlined, size: 21),
                  ),
                  TextButton.icon(
                    onPressed: () => context.push('/reminders/weekly'),
                    icon: const Icon(Icons.calendar_view_week_outlined, size: 18),
                    label: const Text('本週'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  _StatPill(label: '待完成', value: overdue.length + upcoming.length, accent: false),
                  const SizedBox(width: 8),
                  if (overdue.isNotEmpty)
                    _StatPill(label: '逾時', value: overdue.length, accent: true),
                  const Spacer(),
                  Text(
                    tasks.isLoading ? '同步中…' : '自動同步',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _MapEntryCard(animals: animals),
            ),
            const SizedBox(height: 16),
            if (tasks.hasError)
              ErrorView(
                message: '讀取任務失敗，請檢查網路後重新整理。',
                onRetry: () => ref.invalidate(todayTasksProvider),
              )
            else if (tasks.isLoading)
              const LoadingView()
            else if (overdue.isEmpty && upcoming.isEmpty && done.isEmpty)
              EmptyState(
                title: '今天沒有任務',
                body: '可以到居民頁新增提醒，或先記一筆照護。',
                action: FilledButton(
                  onPressed: () => context.go('/animals'),
                  child: const Text('看看居民'),
                ),
              )
            else ...[
              if (overdue.isNotEmpty)
                _TaskSection(
                  title: '逾期',
                  count: overdue.length,
                  color: AppTokens.overdue,
                  tasks: overdue,
                  busyKey: _busyKey,
                  onComplete: _complete,
                ),
              if (upcoming.isNotEmpty)
                _TaskSection(
                  title: '今天',
                  count: upcoming.length,
                  color: AppTokens.primaryStrong,
                  tasks: upcoming,
                  busyKey: _busyKey,
                  onComplete: _complete,
                ),
              if (done.isNotEmpty)
                _TaskSection(
                  title: '已完成',
                  count: done.length,
                  color: AppTokens.muted,
                  tasks: done,
                  busyKey: _busyKey,
                  onComplete: _complete,
                ),
            ],
          ],
        ),
      ),
    );
  }

  static String _greeting(DateTime now) {
    final hour = now.hour;
    if (hour < 5) return '夜深了';
    if (hour < 11) return '早安';
    if (hour < 17) return '午安';
    return '晚安';
  }

  static String _dateLabel(DateTime now, String timezone) {
    final key = localDateKey(now, timezone);
    final parts = key.split('-');
    final month = int.tryParse(parts.length > 1 ? parts[1] : '') ?? now.month;
    final day = int.tryParse(parts.length > 2 ? parts[2] : '') ?? now.day;
    return '$month 月 $day 日 · 週${weekdayLabel(weekdayOf(key))}';
  }
}

class _StatPill extends StatelessWidget {
  const _StatPill({required this.label, required this.value, required this.accent});

  final String label;
  final int value;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: accent ? AppTokens.warningBg : AppTokens.card,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: accent ? AppTokens.accent : AppTokens.line),
      ),
      child: Text(
        '$label $value',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: accent ? AppTokens.overdue : AppTokens.primaryStrong,
        ),
      ),
    );
  }
}

class _TaskSection extends StatelessWidget {
  const _TaskSection({
    required this.title,
    required this.count,
    required this.color,
    required this.tasks,
    required this.busyKey,
    required this.onComplete,
  });

  final String title;
  final int count;
  final Color color;
  final List<TodayTask> tasks;
  final String? busyKey;
  final ValueChanged<TodayTask> onComplete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: MossCard(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  title,
                  style: TextStyle(fontWeight: FontWeight.w800, color: color, fontSize: 13),
                ),
                const SizedBox(width: 6),
                Text('$count', style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            const Divider(height: 20),
            for (final task in tasks)
              TodayTaskRow(
                task: task,
                busy: busyKey == '${task.reminderId}:${task.dueDate}',
                onComplete: () => onComplete(task),
              ),
          ],
        ),
      ),
    );
  }
}


class _MapEntryCard extends StatelessWidget {
  const _MapEntryCard({required this.animals});

  final List<Animal> animals;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      onTap: () => context.push('/map'),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppTokens.successBg, AppTokens.butter],
              ),
              borderRadius: BorderRadius.circular(15),
            ),
            child: Icon(Icons.map_outlined, color: AppTokens.primaryStrong),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('苔間地圖', style: TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(
                  animals.isEmpty ? '把居民放進喜歡的角落' : '${animals.length} 位居民正在地圖上生活',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (animals.isNotEmpty)
            SizedBox(
              width: 54,
              height: 34,
              child: Stack(
                children: [
                  for (var index = 0; index < animals.take(3).length; index++)
                    Positioned(
                      left: index * 15,
                      child: AnimalAvatar(
                        label: animals[index].initial,
                        colorHex: animals[index].avatarColor,
                        pattern: animals[index].avatarPattern,
                        size: 34,
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(width: 4),
          Icon(Icons.chevron_right, color: AppTokens.muted),
        ],
      ),
    );
  }
}
