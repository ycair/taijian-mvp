import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'journal_models.dart';
import 'journal_repository.dart';

class JournalScreen extends ConsumerWidget {
  const JournalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(journalEntriesProvider);
    final animals = ref.watch(animalsProvider).value ?? const [];
    final byId = {for (final animal in animals) animal.id: animal};

    return Scaffold(
      appBar: AppBar(
        title: const Text('旅程'),
        actions: [
          IconButton(
            tooltip: '新增旅程',
            onPressed: () => context.push('/journal/new'),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: RefreshIndicator(
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
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _JournalCard extends StatelessWidget {
  const _JournalCard({required this.entry, required this.animalNames});

  final JournalEntry entry;
  final List<String> animalNames;

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
                  if (animalNames.isNotEmpty) ...[
                    const SizedBox(height: 7),
                    Text(
                      animalNames.join(' · '),
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTokens.primaryStrong),
                    ),
                  ],
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
