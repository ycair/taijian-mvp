import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import 'record_actions.dart';

class RecordActionTile extends ConsumerWidget {
  const RecordActionTile({
    super.key,
    required this.record,
    required this.animal,
    required this.timezone,
    this.showAnimal = false,
  });

  final CareRecord record;
  final Animal? animal;
  final String timezone;
  final bool showAnimal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(currentUserProvider)?.uid;
    final isOwner = ref.watch(householdOwnerProvider);
    final canModify = animal != null &&
        !animal!.isMemorial &&
        record.canModify(uid: uid, isOwner: isOwner);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: AppTokens.successBg, shape: BoxShape.circle),
            child: Icon(iconForRecord(record.type), size: 18, color: AppTokens.primaryStrong),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  [
                    if (showAnimal) animal?.name ?? record.animalName ?? '已刪除居民',
                    record.type.label,
                  ].join(' · '),
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
            formatDateTime(record.occurredAt, timezone),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (canModify)
            PopupMenuButton<String>(
              tooltip: '紀錄操作',
              icon: const Icon(Icons.more_horiz, size: 19),
              onSelected: (value) {
                if (value == 'edit') {
                  editCareRecord(context, ref, animal: animal!, record: record);
                } else if (value == 'delete') {
                  deleteCareRecord(context, ref, record: record);
                }
              },
              itemBuilder: (context) => const [
                PopupMenuItem(value: 'edit', child: Text('編輯紀錄')),
                PopupMenuItem(
                  value: 'delete',
                  child: Text('刪除紀錄', style: TextStyle(color: AppTokens.overdue)),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

IconData iconForRecord(RecordType type) => switch (type) {
  RecordType.feeding => Icons.restaurant_outlined,
  RecordType.water => Icons.water_drop_outlined,
  RecordType.weight => Icons.monitor_weight_outlined,
  RecordType.length => Icons.straighten,
  RecordType.poop => Icons.circle_outlined,
  RecordType.shed => Icons.change_history,
  RecordType.activity => Icons.directions_run,
  RecordType.medical => Icons.medical_services_outlined,
  RecordType.note => Icons.edit_note,
  RecordType.custom => Icons.straighten,
};
