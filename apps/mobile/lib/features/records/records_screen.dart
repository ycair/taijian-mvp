import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import '../../core/widgets/common.dart';
import 'quick_record_sheet.dart';

class RecordsScreen extends ConsumerWidget {
  const RecordsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final householdId = ref.watch(householdIdProvider);
    final recordsAsync = ref.watch(recordsProvider);
    final animals = ref.watch(activeAnimalsProvider);
    final timezone = ref.watch(householdTimezoneProvider);

    if (householdId == null) {
      return SafeArea(
        child: Column(
          children: [
            const PageHeader(kicker: 'Timeline', title: '照護紀錄'),
            Expanded(
              child: EmptyState(
                title: '還沒有家庭',
                body: '加入家庭後，這裡會整理所有居民的照護時間軸。',
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

    final byId = {for (final animal in animals) animal.id: animal};
    final visible = (recordsAsync.value ?? const <CareRecord>[])
        .where((record) => byId.containsKey(record.animalId))
        .toList();

    final groups = <String, List<CareRecord>>{};
    for (final record in visible) {
      final key = localDateKey(record.occurredAt, timezone);
      groups.putIfAbsent(key, () => []).add(record);
    }
    final today = localDateKey(DateTime.now(), timezone);

    return SafeArea(
      child: RefreshIndicator(
        color: AppTokens.primary,
        onRefresh: () async => ref.invalidate(recordsProvider),
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            PageHeader(
              kicker: 'Timeline',
              title: '照護紀錄',
              subtitle: '所有居民的生活，按照發生時間排好。',
              trailing: animals.isEmpty
                  ? null
                  : TextButton.icon(
                      onPressed: () => _pickAnimal(context, animals),
                      icon: const Icon(Icons.add, size: 20),
                      label: const Text('紀錄'),
                    ),
            ),
            if (recordsAsync.hasError)
              ErrorView(
                message: '讀取紀錄失敗，請檢查網路後重新整理。',
                onRetry: () => ref.invalidate(recordsProvider),
              )
            else if (recordsAsync.isLoading)
              const LoadingView()
            else if (visible.isEmpty)
              EmptyState(
                title: '還沒有紀錄',
                body: '從居民頁按一下快速紀錄，第一個照護事實就會出現在這裡。',
                action: FilledButton(
                  onPressed: () => _pickAnimal(context, animals),
                  child: const Text('新增一筆紀錄'),
                ),
              )
            else
              for (final key in groups.keys.toList()..sort((a, b) => b.compareTo(a)))
                _RecordGroup(
                  dateKey: key,
                  label: _dateLabel(key, today, timezone),
                  records: groups[key]!,
                  animals: byId,
                  timezone: timezone,
                ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAnimal(BuildContext context, List<Animal> animals) async {
    if (animals.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('先新增一位居民，才能建立紀錄。')),
      );
      return;
    }
    final picked = await showModalBottomSheet<Animal>(
      context: context,
      useSafeArea: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          children: [
            Text('要記錄哪位居民？', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            for (final animal in animals)
              ListTile(
                leading: AnimalAvatar(
                  label: animal.initial,
                  colorHex: animal.avatarColor,
                ),
                title: Text(animal.name),
                subtitle: Text(animal.displaySpecies),
                onTap: () => Navigator.of(context).pop(animal),
              ),
          ],
        ),
      ),
    );
    if (picked != null && context.mounted) {
      await QuickRecordSheet.show(context, animal: picked);
    }
  }

  static String _dateLabel(String dateKey, String today, String timezone) {
    if (dateKey == today) return '今天';
    if (dateKey == shiftDateKey(today, -1)) return '昨天';
    final parts = dateKey.split('-');
    return '${parts[0]}/${parts[1]}/${parts[2]}';
  }
}

class _RecordGroup extends StatelessWidget {
  const _RecordGroup({
    required this.dateKey,
    required this.label,
    required this.records,
    required this.animals,
    required this.timezone,
  });

  final String dateKey;
  final String label;
  final List<CareRecord> records;
  final Map<String, Animal> animals;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8, left: 4),
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                color: AppTokens.primaryStrong,
                fontSize: 12,
              ),
            ),
          ),
          MossCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(
              children: [
                for (final record in records) _RecordTile(record: record, animal: animals[record.animalId], timezone: timezone),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record, required this.animal, required this.timezone});

  final CareRecord record;
  final Animal? animal;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: AppTokens.successBg, shape: BoxShape.circle),
            child: Icon(_iconFor(record.type), size: 18, color: AppTokens.primaryStrong),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${animal?.name ?? '已刪除居民'} · ${record.type.label}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                if (record.summary.isNotEmpty)
                  Text(
                    record.summary,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            formatClock(record.occurredAt, timezone),
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
