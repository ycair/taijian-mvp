import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/outbox/outbox_database.dart';

/// Shows the first unresolved conflict anywhere in the app.
///
/// "查看最新" drops the queued write and lets the screen render the fresh read.
/// "保留我的" re-reads the revision from the conflict response and resubmits the
/// local payload under a new command id, after an explicit confirmation.
class OutboxConflictPanel extends ConsumerStatefulWidget {
  const OutboxConflictPanel({super.key});

  @override
  ConsumerState<OutboxConflictPanel> createState() => _OutboxConflictPanelState();
}

class _OutboxConflictPanelState extends ConsumerState<OutboxConflictPanel> {
  bool _busy = false;

  Future<void> _viewLatest(OutboxEntry entry) async {
    setState(() => _busy = true);
    await ref.read(outboxProvider).discard(entry.commandId);
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已顯示最新資料，你的變更已捨棄。')),
    );
  }

  Future<void> _keepMine(OutboxEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('保留我的版本？'),
        content: const Text('這會用你剛才的內容覆蓋其他人的更新，確定要繼續嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('確定覆蓋')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    final newId = await ref.read(outboxProvider).keepMine(entry.commandId);
    if (newId != null) await ref.read(outboxProvider).flush();
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(newId == null ? '無法重新送出，請再試一次。' : '已用最新版本重新送出。')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final conflicts = ref.watch(conflictsProvider).value ?? const <OutboxEntry>[];
    if (conflicts.isEmpty) return const SizedBox.shrink();
    final entry = conflicts.first;
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: ConflictBanner(
          title: '「${_label(entry.type)}」剛被其他人更新',
          body: '你有一筆離線變更和最新資料衝突。要查看最新內容，還是保留你的版本？',
          busy: _busy,
          onViewLatest: () => _viewLatest(entry),
          onKeepMine: () => _keepMine(entry),
        ),
      ),
    );
  }

  static String _label(String type) => switch (type) {
    'animal.update' => '居民資料',
    'animal.archive' => '居民狀態',
    'reminder.update' => '提醒',
    'reminder.delete' => '提醒',
    'household.update' => '家庭資料',
    _ => '資料',
  };
}

/// A compact strip for failed (non-conflict) commands.
class OutboxFailedStrip extends ConsumerWidget {
  const OutboxFailedStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(outboxEntriesProvider).value ?? const <OutboxEntry>[];
    final failed = entries.where((entry) => entry.status == OutboxStatus.failed).toList();
    if (failed.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Material(
        color: AppTokens.butter,
        borderRadius: BorderRadius.circular(AppTokens.radiusMd),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppTokens.radiusMd),
          onTap: () async {
            for (final entry in failed) {
              await ref.read(outboxProvider).retryFailed(entry.commandId);
            }
            await ref.read(outboxProvider).flush();
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                const Icon(Icons.sync_problem, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '有 ${failed.length} 筆變更尚未同步，點此重試。',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                const Icon(Icons.refresh, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
