import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import 'quick_record_sheet.dart';
import 'record_analytics_repository.dart';
import 'record_repository.dart';

Future<void> editCareRecord(
  BuildContext context,
  WidgetRef ref, {
  required Animal animal,
  required CareRecord record,
}) async {
  await QuickRecordSheet.show(context, animal: animal, record: record);
  ref.invalidate(recordsProvider);
  ref.invalidate(recordAnalyticsProvider);
}

Future<void> deleteCareRecord(
  BuildContext context,
  WidgetRef ref, {
  required CareRecord record,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('刪除這筆紀錄？'),
      content: Text('「${record.type.label}」紀錄會從時間軸與分析中移除。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('保留'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFC96F4A)),
          child: const Text('刪除'),
        ),
      ],
    ),
  );
  if (confirmed != true) return;
  try {
    await ref.read(recordRepositoryProvider).delete(record);
    ref.invalidate(recordsProvider);
    ref.invalidate(recordAnalyticsProvider);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('紀錄已刪除，會自動同步。')),
      );
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('刪除失敗：$error')),
      );
    }
  }
}
