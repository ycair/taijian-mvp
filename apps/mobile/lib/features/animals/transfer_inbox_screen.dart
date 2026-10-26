import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'transfer_repository.dart';

class TransferInboxScreen extends ConsumerWidget {
  const TransferInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transfers = ref.watch(transfersProvider);
    final pendingIncoming = (transfers.value ?? const <AnimalTransfer>[])
        .where((transfer) => transfer.isIncoming && transfer.isPending && !transfer.isExpired)
        .toList(growable: false);
    final pendingOutgoing = (transfers.value ?? const <AnimalTransfer>[])
        .where((transfer) => !transfer.isIncoming && transfer.isPending && !transfer.isExpired)
        .toList(growable: false);
    final history = (transfers.value ?? const <AnimalTransfer>[])
        .where((transfer) => !transfer.isPending || transfer.isExpired)
        .toList(growable: false);

    return Scaffold(
      appBar: AppBar(title: const Text('轉移邀請')),
      body: RefreshIndicator(
        color: AppTokens.primary,
        onRefresh: () async => ref.invalidate(transfersProvider),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
          children: [
            if (transfers.hasError)
              ErrorView(
                message: '讀取轉移邀請失敗，請稍後再試。',
                onRetry: () => ref.invalidate(transfersProvider),
              )
            else if (transfers.isLoading)
              const LoadingView()
            else ...[
              const _InboxHeading(title: '等待你回覆'),
              if (pendingIncoming.isEmpty)
                _EmptyInbox(text: '目前沒有新的轉移邀請。')
              else
                for (final transfer in pendingIncoming)
                  _TransferCard(
                    transfer: transfer,
                    primaryLabel: '接受',
                    secondaryLabel: '拒絕',
                    onPrimary: () => _accept(context, ref, transfer),
                    onSecondary: () => _decline(context, ref, transfer),
                  ),
              const SizedBox(height: 22),
              const _InboxHeading(title: '等待對方回覆'),
              if (pendingOutgoing.isEmpty)
                _EmptyInbox(text: '目前沒有送出的轉移邀請。')
              else
                for (final transfer in pendingOutgoing)
                  _TransferCard(
                    transfer: transfer,
                    primaryLabel: '取消邀請',
                    onPrimary: () => _cancel(context, ref, transfer),
                  ),
              if (history.isNotEmpty) ...[
                const SizedBox(height: 22),
                const _InboxHeading(title: '歷史'),
                for (final transfer in history) _TransferCard(transfer: transfer),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _accept(
    BuildContext context,
    WidgetRef ref,
    AnimalTransfer transfer,
  ) async {
    final households = await ref.read(ownedHouseholdsProvider.future);
    if (!context.mounted) return;
    if (households.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('請先建立一個家庭，才能接受居民。')),
      );
      return;
    }
    final target = await showDialog<Household>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('要放到哪個家庭？'),
        children: [
          for (final household in households)
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(household),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(household.name),
              ),
            ),
        ],
      ),
    );
    if (target == null) return;
    try {
      await ref.read(transferRepositoryProvider).accept(
        transfer: transfer,
        targetHouseholdId: target.id,
      );
      ref.invalidate(transfersProvider);
      ref.invalidate(animalsProvider);
      ref.invalidate(recordsProvider);
      ref.invalidate(remindersProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已接受轉移，居民會出現在你的家庭。')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('接受失敗：$error')),
        );
      }
    }
  }

  Future<void> _decline(
    BuildContext context,
    WidgetRef ref,
    AnimalTransfer transfer,
  ) async {
    try {
      await ref.read(transferRepositoryProvider).decline(transfer);
      ref.invalidate(transfersProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已拒絕轉移邀請。')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('拒絕失敗：$error')),
        );
      }
    }
  }

  Future<void> _cancel(
    BuildContext context,
    WidgetRef ref,
    AnimalTransfer transfer,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('取消轉移邀請？'),
        content: Text('「${transfer.animalLabel}」會留在目前家庭。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('保留'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('取消邀請'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(transferRepositoryProvider).cancel(transfer);
      ref.invalidate(transfersProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('轉移邀請已取消。')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('取消失敗：$error')),
        );
      }
    }
  }
}

class _InboxHeading extends StatelessWidget {
  const _InboxHeading({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

class _EmptyInbox extends StatelessWidget {
  const _EmptyInbox({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      padding: const EdgeInsets.all(16),
      child: Text(text, style: Theme.of(context).textTheme.bodySmall),
    );
  }
}

class _TransferCard extends StatelessWidget {
  const _TransferCard({
    required this.transfer,
    this.primaryLabel,
    this.secondaryLabel,
    this.onPrimary,
    this.onSecondary,
  });

  final AnimalTransfer transfer;
  final String? primaryLabel;
  final String? secondaryLabel;
  final VoidCallback? onPrimary;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    final expired = transfer.isExpired && transfer.status == 'pending';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: MossCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: const BoxDecoration(
                    color: AppTokens.successBg,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    transfer.isIncoming ? Icons.call_received : Icons.call_made,
                    size: 19,
                    color: AppTokens.primaryStrong,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    transfer.animalLabel,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Chip(label: Text(expired ? '已過期' : transfer.statusLabel)),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${transfer.isIncoming ? '來自' : '來源'} ${transfer.sourceHouseholdName}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (primaryLabel != null) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  if (secondaryLabel != null)
                    TextButton(
                      onPressed: onSecondary,
                      child: Text(secondaryLabel!),
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: expired ? null : onPrimary,
                    child: Text(primaryLabel!),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
