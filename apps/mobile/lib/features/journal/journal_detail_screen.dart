import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'journal_models.dart';
import 'journal_repository.dart';
import 'journal_screen.dart';

class JournalDetailScreen extends ConsumerWidget {
  const JournalDetailScreen({super.key, required this.entryId});

  final String entryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entryAsync = ref.watch(journalEntryProvider(entryId));
    final entry = entryAsync.value;
    final animals = ref.watch(animalsProvider).value ?? const [];
    final byId = {for (final animal in animals) animal.id: animal};
    final uid = ref.watch(currentUserProvider)?.uid;
    final isOwner = ref.watch(householdOwnerProvider);
    final canEdit = entry != null && (isOwner || entry.createdBy == uid);

    if (entryAsync.isLoading && entry == null) {
      return const Scaffold(appBar: null, body: LoadingView());
    }
    if (entry == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('旅程')),
        body: EmptyState(
          title: '找不到旅程',
          body: '這篇旅程可能已被刪除。',
          action: FilledButton(onPressed: () => context.pop(), child: const Text('返回')),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('旅程'),
        actions: [
          if (entry.publicUrl != null)
            IconButton(
              tooltip: '複製分享連結',
              onPressed: () => _copyLink(context, entry),
              icon: const Icon(Icons.link),
            ),
          IconButton(
            tooltip: '分享旅程',
            onPressed: () => _share(entry),
            icon: const Icon(Icons.ios_share),
          ),
          if (canEdit) ...[
            IconButton(
              tooltip: '編輯旅程',
              onPressed: () => context.push('/journal/${entry.id}/edit'),
              icon: const Icon(Icons.edit_outlined),
            ),
            PopupMenuButton<String>(
              tooltip: '旅程管理',
              onSelected: (value) {
                if (value == 'delete') _delete(context, ref, entry);
              },
              itemBuilder: (context) => const [
                PopupMenuItem(
                  value: 'delete',
                  child: Text('刪除旅程', style: TextStyle(color: AppTokens.overdue)),
                ),
              ],
            ),
          ],
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
        children: [
          if (entry.effectiveCoverPath != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(AppTokens.radiusLg),
              child: AspectRatio(
                aspectRatio: 4 / 3,
                child: JournalPhotoImage(path: entry.effectiveCoverPath!, fit: BoxFit.cover),
              ),
            )
          else
            ClipRRect(
              borderRadius: BorderRadius.circular(AppTokens.radiusLg),
              child: const AspectRatio(aspectRatio: 4 / 3, child: _LargePlaceholder()),
            ),
          const SizedBox(height: 18),
          Row(
            children: [
              Text(entry.journalDate, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(width: 8),
              _VisibilityBadge(label: entry.visibilityLabel),
            ],
          ),
          const SizedBox(height: 3),
          Text(entry.title, style: Theme.of(context).textTheme.headlineSmall),
          if (entry.animalIds.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final id in entry.animalIds)
                  if (byId[id] != null)
                    Chip(
                      avatar: CircleAvatar(
                        backgroundColor: AppTokens.colorFromHex(byId[id]!.avatarColor),
                        child: Text(byId[id]!.initial, style: const TextStyle(fontSize: 10)),
                      ),
                      label: Text(byId[id]!.name),
                    ),
              ],
            ),
          ],
          if (entry.body.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(entry.body, style: const TextStyle(height: 1.7, fontSize: 15)),
          ],
          const SizedBox(height: 24),
          Text('照片盒', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (entry.photos.isEmpty)
            Text('這篇旅程沒有照片。', style: Theme.of(context).textTheme.bodySmall)
          else
            for (final photo in entry.photos)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppTokens.radiusMd),
                      child: AspectRatio(
                        aspectRatio: 4 / 3,
                        child: JournalPhotoImage(path: photo.path, fit: BoxFit.cover),
                      ),
                    ),
                    if (photo.caption.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Text(photo.caption, style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ],
                ),
              ),
        ],
      ),
    );
  }

  Future<void> _share(JournalEntry entry) async {
    try {
      await SharePlus.instance.share(
        ShareParams(
          text: [
            '苔間旅程 · ${entry.title}',
            entry.journalDate,
            '',
            entry.body,
            if (entry.publicUrl != null) '',
            if (entry.publicUrl != null) entry.publicUrl!,
          ].join('\n'),
          subject: entry.title,
        ),
      );
    } catch (_) {
      // The system share sheet can be unavailable on simulators.
    }
  }

  Future<void> _copyLink(BuildContext context, JournalEntry entry) async {
    final url = entry.publicUrl;
    if (url == null) return;
    await Clipboard.setData(ClipboardData(text: url));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('分享連結已複製。')),
      );
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, JournalEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除這篇旅程？'),
        content: const Text('旅程會從家庭時間軸隱藏，照片也會一併移除。'),
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
      await ref.read(journalRepositoryProvider).delete(entry);
      ref.invalidate(journalEntriesProvider);
      if (context.mounted) {
        context.go('/journal');
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('旅程已刪除。')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('刪除失敗：$error')));
      }
    }
  }
}

class _LargePlaceholder extends StatelessWidget {
  const _LargePlaceholder();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTokens.successBg, AppTokens.butter],
        ),
      ),
      child: const Center(
        child: Icon(Icons.menu_book_outlined, size: 56, color: AppTokens.primaryStrong),
      ),
    );
  }
}


class _VisibilityBadge extends StatelessWidget {
  const _VisibilityBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppTokens.successBg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppTokens.primaryStrong),
      ),
    );
  }
}
