import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import '../../core/widgets/common.dart';
import '../records/quick_record_sheet.dart';
import '../reminders/reminder_repository.dart';

class AnimalDetailScreen extends ConsumerWidget {
  const AnimalDetailScreen({super.key, required this.animalId});

  final String animalId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final animalAsync = ref.watch(animalProvider(animalId));
    final reminderAsync = ref.watch(animalRemindersProvider(animalId));
    final recordAsync = ref.watch(animalRecordsProvider(animalId));
    final timezone = ref.watch(householdTimezoneProvider);
    final animal = animalAsync.value;

    if (animalAsync.isLoading && animal == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('居民')),
        body: const LoadingView(),
      );
    }
    if (animal == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('居民')),
        body: EmptyState(
          title: '找不到這位居民',
          body: '牠可能已被封存或刪除。',
          action: FilledButton(onPressed: () => context.go('/animals'), child: const Text('回到居民列表')),
        ),
      );
    }

    final reminders = reminderAsync.value ?? const <Reminder>[];
    final records = recordAsync.value ?? const <CareRecord>[];

    return Scaffold(
      appBar: AppBar(
        title: Text(animal.name),
        leading: IconButton(
          tooltip: '返回',
          onPressed: () => context.go('/animals'),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 36),
        children: [
          MossCard(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                AnimalAvatar(label: animal.initial, colorHex: animal.avatarColor, size: 76),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(animal.name, style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 4),
                      Text(
                        [animal.displaySpecies, if (animal.morph != null) animal.morph!].join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _MetaChip(label: _sexLabel(animal.sex)),
                          if (animal.birthDate != null) _MetaChip(label: '生日 ${animal.birthDate}'),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (animal.notes != null && animal.notes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            MossCard(
              child: Text(animal.notes!, style: const TextStyle(height: 1.5)),
            ),
          ],
          const SizedBox(height: 22),
          const _SectionTitle(title: '快速紀錄'),
          const SizedBox(height: 10),
          MossCard(
            padding: const EdgeInsets.all(16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _QuickAction(
                  icon: Icons.restaurant_outlined,
                  label: '餵食',
                  onTap: () => QuickRecordSheet.show(context, animal: animal),
                ),
                _QuickAction(
                  icon: Icons.water_drop_outlined,
                  label: '換水',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.water),
                ),
                _QuickAction(
                  icon: Icons.monitor_weight_outlined,
                  label: '量體重',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.weight),
                ),
                _QuickAction(
                  icon: Icons.circle_outlined,
                  label: '排便',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.poop),
                ),
                _QuickAction(
                  icon: Icons.change_history,
                  label: '蛻皮',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.shed),
                ),
                _QuickAction(
                  icon: Icons.edit_note,
                  label: '備註',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.note),
                ),
              ],
            ),
          ),
          const SizedBox(height: 26),
          Row(
            children: [
              const Expanded(child: _SectionTitle(title: '提醒')),
              TextButton.icon(
                onPressed: () => context.push('/reminders/new?animalId=${animal.id}'),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('新增'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (reminderAsync.hasError)
            InlineBanner(
              icon: Icons.cloud_off_outlined,
              message: '讀取提醒失敗，請稍後重新整理。',
              color: const Color(0xFFFFE7D6),
            )
          else if (reminders.isEmpty)
            MossCard(
              child: Text(
                '還沒有提醒。替 ${animal.name} 設一個固定的照護時間吧。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            )
          else
            ...reminders.map(
              (reminder) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _ReminderCard(reminder: reminder, animal: animal, timezone: timezone),
              ),
            ),
          const SizedBox(height: 26),
          const _SectionTitle(title: '最近紀錄'),
          const SizedBox(height: 10),
          if (recordAsync.hasError)
            InlineBanner(
              icon: Icons.cloud_off_outlined,
              message: '讀取紀錄失敗，請稍後重新整理。',
              color: const Color(0xFFFFE7D6),
            )
          else if (records.isEmpty)
            MossCard(
              child: Text('還沒有紀錄。', style: Theme.of(context).textTheme.bodySmall),
            )
          else
            MossCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Column(
                children: [
                  for (final record in records.take(6))
                    _RecordRow(record: record, timezone: timezone),
                ],
              ),
            ),
        ],
      ),
    );
  }

  static String _sexLabel(String sex) => switch (sex) {
    'female' => '母',
    'male' => '公',
    _ => '性別未知',
  };
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTokens.successBg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTokens.primaryStrong),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(title, style: Theme.of(context).textTheme.titleMedium);
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: AppTokens.successBg,
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppTokens.radiusSm),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 19, color: AppTokens.primaryStrong),
                const SizedBox(width: 6),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReminderCard extends ConsumerStatefulWidget {
  const _ReminderCard({required this.reminder, required this.animal, required this.timezone});

  final Reminder reminder;
  final Animal animal;
  final String timezone;

  @override
  ConsumerState<_ReminderCard> createState() => _ReminderCardState();
}

class _ReminderCardState extends ConsumerState<_ReminderCard> {
  bool _busy = false;

  Future<void> _toggle(bool value) async {
    setState(() => _busy = true);
    try {
      await ref.read(reminderRepositoryProvider).update(reminder: widget.reminder, enabled: value);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('更新失敗：$error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除提醒？'),
        content: Text('「${widget.reminder.title}」之後不會再出現在今日任務。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppTokens.overdue),
            child: const Text('刪除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(reminderRepositoryProvider).delete(widget.reminder);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('刪除失敗：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final reminder = widget.reminder;
    return MossCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(color: AppTokens.successBg, shape: BoxShape.circle),
            child: const Icon(Icons.alarm, size: 20, color: AppTokens.primaryStrong),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(reminder.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  '${reminder.schedule.label} · ${nextDueLabel(reminder)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            Switch(
              value: reminder.enabled,
              onChanged: _toggle,
            ),
          PopupMenuButton<String>(
            tooltip: '更多',
            onSelected: (value) {
              if (value == 'edit') {
                context.push('/reminders/${reminder.id}?animalId=${widget.animal.id}');
              } else if (value == 'delete') {
                _delete();
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'edit', child: Text('編輯')),
              PopupMenuItem(value: 'delete', child: Text('刪除')),
            ],
          ),
        ],
      ),
    );
  }
}

class _RecordRow extends StatelessWidget {
  const _RecordRow({required this.record, required this.timezone});

  final CareRecord record;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: AppTokens.successBg, shape: BoxShape.circle),
            child: Icon(_iconFor(record.type), size: 17, color: AppTokens.primaryStrong),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  record.type.label,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                if (record.summary.isNotEmpty)
                  Text(record.summary, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          Text(
            formatDateTime(record.occurredAt, timezone),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  static IconData _iconFor(RecordType type) => switch (type) {
    RecordType.feeding => Icons.restaurant_outlined,
    RecordType.water => Icons.water_drop_outlined,
    RecordType.weight => Icons.monitor_weight_outlined,
    RecordType.poop => Icons.circle_outlined,
    RecordType.shed => Icons.change_history,
    RecordType.activity => Icons.directions_run,
    RecordType.medical => Icons.medical_services_outlined,
    RecordType.note => Icons.edit_note,
    RecordType.custom => Icons.straighten,
  };
}
