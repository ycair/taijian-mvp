import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'journal_models.dart';
import 'journal_repository.dart';
import 'public_journal_feed.dart';

class JournalScreen extends StatelessWidget {
  const JournalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('旅程'),
          actions: [
            IconButton(
              tooltip: '新增家庭旅程',
              onPressed: () => context.push('/journal/new'),
              icon: const Icon(Icons.add),
            ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(text: '家庭'),
              Tab(text: '探索'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _HouseholdJournalView(),
            PublicJournalFeedView(),
          ],
        ),
      ),
    );
  }
}

class _HouseholdJournalView extends ConsumerWidget {
  const _HouseholdJournalView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(journalEntriesProvider);
    final animals = ref.watch(animalsProvider).value ?? const [];
    final members = ref.watch(householdMembersProvider).value ?? const [];
    final byId = {for (final animal in animals) animal.id: animal};

    return RefreshIndicator(
      color: AppTokens.primary,
      onRefresh: () async => ref.invalidate(journalEntriesProvider),
      child: entries.when(
          loading: () => const LoadingView(),
          error: (error, stack) => ListView(
            children: [
              ErrorView(
                message: '讀取旅程失敗，請稍後再試。',
                onRetry: () => ref.invalidate(journalEntriesProvider),
              ),
            ],
          ),
          data: (items) => items.isEmpty
              ? ListView(
                  padding: const EdgeInsets.only(top: 36),
                  children: [
                    EmptyState(
                      title: '還沒有旅程',
                      body: '把第一次蛻皮、第一次主動靠近，寫成一篇旅程。',
                      action: FilledButton(
                        onPressed: () => context.push('/journal/new'),
                        child: const Text('寫下第一篇'),
                      ),
                    ),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 36),
                  children: [
                    Text(
                      '把每一次照顧，留在同一個家。',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 14),
                    for (final entry in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: _JournalCard(
                          entry: entry,
                          animalNames: [
                            for (final id in entry.animalIds)
                              if (byId[id] != null) byId[id]!.name,
                          ],
                          authorName: members
                              .where((member) => member.uid == entry.createdBy)
                              .map((member) => member.displayName)
                              .firstOrNull,
                        ),
                      ),
                  ],
              ),
      ),
    );
  }
}

class _JournalCard extends StatelessWidget {
  const _JournalCard({required this.entry, required this.animalNames, this.authorName});

  final JournalEntry entry;
  final List<String> animalNames;
  final String? authorName;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      padding: EdgeInsets.zero,
      onTap: () => context.push('/journal/${entry.id}'),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTokens.radiusLg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: entry.effectiveCoverPath == null
                  ? const _JournalPlaceholder()
                  : JournalPhotoImage(path: entry.effectiveCoverPath!, fit: BoxFit.cover),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 14,
                        backgroundColor: AppTokens.successBg,
                        child: Text(
                          (authorName ?? '苔').trim().isEmpty ? '苔' : (authorName ?? '苔').trim().substring(0, 1),
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppTokens.primaryStrong),
                        ),
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          authorName ?? '家庭成員',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                      _VisibilityChip(label: entry.visibilityLabel),
                    ],
                  ),
                  const SizedBox(height: 7),
                  Text(entry.journalDate, style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 3),
                  Text(entry.title, style: Theme.of(context).textTheme.titleMedium),
                  if (entry.body.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      entry.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      if (animalNames.isNotEmpty)
                        Expanded(
                          child: Text(
                            animalNames.join(' · '),
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTokens.primaryStrong),
                          ),
                        )
                      else
                        const Spacer(),
                      const Icon(Icons.photo_library_outlined, size: 14, color: AppTokens.muted),
                      const SizedBox(width: 4),
                      Text('${entry.photos.length}', style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _JournalPlaceholder extends StatelessWidget {
  const _JournalPlaceholder();

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
        child: Icon(Icons.menu_book_outlined, size: 42, color: AppTokens.primaryStrong),
      ),
    );
  }
}

class JournalPhotoImage extends ConsumerWidget {
  const JournalPhotoImage({super.key, required this.path, this.fit = BoxFit.cover});

  final String path;
  final BoxFit fit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(journalPhotoUrlProvider(path));
    return url.when(
      loading: () => const ColoredBox(color: AppTokens.successBg),
      error: (error, stack) => const _JournalPlaceholder(),
      data: (value) => value == null
          ? const _JournalPlaceholder()
          : Image.network(
              value,
              fit: fit,
              loadingBuilder: (context, child, progress) =>
                  progress == null ? child : const ColoredBox(color: AppTokens.successBg),
              errorBuilder: (context, error, stack) => const _JournalPlaceholder(),
            ),
    );
  }
}


class _VisibilityChip extends StatelessWidget {
  const _VisibilityChip({required this.label});

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
