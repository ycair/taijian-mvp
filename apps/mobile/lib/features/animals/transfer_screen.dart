import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'transfer_repository.dart';

class TransferScreen extends ConsumerStatefulWidget {
  const TransferScreen({super.key, required this.animalId});

  final String animalId;

  @override
  ConsumerState<TransferScreen> createState() => _TransferScreenState();
}

class _TransferScreenState extends ConsumerState<TransferScreen> {
  String _mode = 'own';
  String? _targetHouseholdId;
  final _targetUidController = TextEditingController();
  final _noteController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _targetUidController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit(Animal animal) async {
    if (_busy) return;
    if (animal.isMemorial) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('紀念中的居民不能轉移。')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final repository = ref.read(transferRepositoryProvider);
      if (_mode == 'own') {
        final target = _targetHouseholdId;
        if (target == null) {
          throw StateError('請選擇要轉移到的家庭');
        }
        await repository.createOwn(animal: animal, targetHouseholdId: target);
      } else {
        final targetUid = _targetUidController.text.trim();
        if (targetUid.isEmpty) throw StateError('請輸入對方的 UID');
        await repository.createOther(
          animal: animal,
          targetUserId: targetUid,
          note: _noteController.text,
        );
      }
      ref.invalidate(transfersProvider);
      ref.invalidate(animalsProvider);
      ref.invalidate(recordsProvider);
      ref.invalidate(remindersProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_mode == 'own'
              ? '居民已移到另一個家庭，會自動同步。'
              : '轉移邀請已送出，等待對方接受。'),
        ),
      );
      context.go('/animals');
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('轉移失敗：$error')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final animal = ref.watch(animalProvider(widget.animalId)).value;
    final householdsAsync = ref.watch(ownedHouseholdsProvider);
    final currentHousehold = ref.watch(householdIdProvider);
    final households = (householdsAsync.value ?? const <Household>[])
        .where((household) => household.id != currentHousehold)
        .toList(growable: false);
    final selectedHousehold = households.any((h) => h.id == _targetHouseholdId)
        ? _targetHouseholdId
        : null;

    if (animal == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('轉移居民')),
        body: const EmptyState(title: '找不到居民', body: '牠可能已被轉移或刪除。'),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('轉移居民')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
        children: [
          MossCard(
            child: Row(
              children: [
                AnimalAvatar(label: animal.initial, colorHex: animal.avatarColor, pattern: animal.avatarPattern, size: 52),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(animal.name, style: Theme.of(context).textTheme.titleMedium),
                      Text(animal.displaySpecies, style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Text('轉移方式', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'own', label: Text('自己的家庭')),
              ButtonSegment(value: 'other', label: Text('其他使用者')),
            ],
            selected: {_mode},
            onSelectionChanged: (value) => setState(() => _mode = value.first),
          ),
          const SizedBox(height: 20),
          if (_mode == 'own') ...[
            Text('目的地', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            if (householdsAsync.isLoading)
              const LinearProgressIndicator(minHeight: 2)
            else if (households.isEmpty)
              MossCard(
                child: Text(
                  '你目前沒有其他可轉移的家庭。先建立另一個家庭，或改用其他使用者 UID。',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              )
            else
              DropdownButtonFormField<String>(
                initialValue: selectedHousehold,
                decoration: const InputDecoration(labelText: '移到哪個家庭'),
                items: [
                  for (final household in households)
                    DropdownMenuItem(value: household.id, child: Text(household.name)),
                ],
                onChanged: (value) => setState(() => _targetHouseholdId = value),
              ),
            const SizedBox(height: 10),
            Text(
              '居民、照護紀錄與提醒會一起移到目的地；家族連結會保留。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ] else ...[
            TextField(
              controller: _targetUidController,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: '對方 UID',
                hintText: '在對方的帳號設定頁可以找到',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _noteController,
              maxLines: 3,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: '給對方的話（選填）',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '對方接受後，居民才會移動；邀請 7 天內有效。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : () => _submit(animal),
            child: _busy
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                  )
                : Text(_mode == 'own' ? '移到另一個家庭' : '送出轉移邀請'),
          ),
          const SizedBox(height: 10),
          Text(
            '轉移後，原本的家庭將看不到這位居民；家族中的不可存取親屬只會顯示為「已轉讓／不可存取」。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (animal.isMemorial) ...[
            const SizedBox(height: 16),
            const InlineBanner(
              icon: Icons.lock_outline,
              message: '紀念中的居民不能轉移。',
              color: AppTokens.successBg,
            ),
          ],
        ],
      ),
    );
  }
}
