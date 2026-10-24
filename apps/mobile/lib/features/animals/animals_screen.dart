import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';

class AnimalsScreen extends ConsumerWidget {
  const AnimalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final householdId = ref.watch(householdIdProvider);
    final animals = ref.watch(animalsProvider);
    final active = ref.watch(activeAnimalsProvider);

    if (householdId == null) {
      return SafeArea(
        child: Column(
          children: [
            const PageHeader(kicker: 'Residents', title: '我的居民'),
            Expanded(
              child: EmptyState(
                title: '還沒有家庭',
                body: '建立家庭後，就能新增第一隻居民。',
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

    return SafeArea(
      child: RefreshIndicator(
        color: AppTokens.primary,
        onRefresh: () async => ref.invalidate(animalsProvider),
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            PageHeader(
              kicker: 'Residents',
              title: '我的居民',
              subtitle: active.isEmpty ? '把第一隻爬寵放進苔間。' : '${active.length} 位居民正在被好好照顧。',
              trailing: TextButton.icon(
                onPressed: () => context.go('/animals/new'),
                icon: const Icon(Icons.add, size: 20),
                label: const Text('新增'),
              ),
            ),
            if (animals.hasError)
              ErrorView(
                message: '讀取居民失敗，請檢查網路後重新整理。',
                onRetry: () => ref.invalidate(animalsProvider),
              )
            else if (animals.isLoading)
              const LoadingView()
            else if (active.isEmpty)
              EmptyState(
                title: '還沒有居民',
                body: '新增第一隻爬寵，開始記錄牠的日常生活。',
                action: FilledButton.icon(
                  onPressed: () => context.go('/animals/new'),
                  icon: const Icon(Icons.add),
                  label: const Text('新增居民'),
                ),
              )
            else
              ...active.map(
                (animal) => Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: _AnimalCard(animal: animal),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _AnimalCard extends StatelessWidget {
  const _AnimalCard({required this.animal});

  final Animal animal;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      onTap: () => context.go('/animals/${animal.id}'),
      child: Row(
        children: [
          AnimalAvatar(label: animal.initial, colorHex: animal.avatarColor, size: 52),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  animal.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    animal.displaySpecies,
                    if (animal.morph != null && animal.morph!.isNotEmpty) animal.morph!,
                  ].join(' · '),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppTokens.muted),
        ],
      ),
    );
  }
}
