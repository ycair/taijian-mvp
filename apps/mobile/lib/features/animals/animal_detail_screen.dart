import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/species.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import '../../core/widgets/common.dart';
import '../records/quick_record_sheet.dart';
import 'animal_repository.dart';
import 'lineage_repository.dart';
import '../records/record_action_tile.dart';
import '../reminders/reminder_repository.dart';

class AnimalDetailScreen extends ConsumerWidget {
  const AnimalDetailScreen({super.key, required this.animalId});

  final String animalId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final animalAsync = ref.watch(animalProvider(animalId));
    final reminderAsync = ref.watch(animalRemindersProvider(animalId));
    final recordAsync = ref.watch(animalRecordsProvider(animalId));
    final lineageAsync = ref.watch(lineageProvider(animalId));
    final timezone = ref.watch(householdTimezoneProvider);
    final animal = animalAsync.value;
    final currentUid = ref.watch(currentUserProvider)?.uid;
    final members = ref.watch(householdMembersProvider).value ?? const <HouseholdMember>[];
    final isOwner = members.any(
      (member) => member.uid == currentUid && member.role == MemberRole.owner,
    );

    if (animalAsync.isLoading && animal == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('居民')),
        body: const LoadingView(),
      );
    }
    if (animal == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('居民')),
        body: EmptyState(
          title: '找不到這位居民',
          body: '牠可能已被封存或刪除。',
          action: FilledButton(onPressed: () => context.go('/animals'), child: const Text('回到居民列表')),
        ),
      );
    }

    final reminders = reminderAsync.value ?? const <Reminder>[];
    final records = recordAsync.value ?? const <CareRecord>[];

    return Scaffold(
      appBar: AppBar(
        title: Text(animal.name),
        leading: IconButton(
          tooltip: '返回',
          onPressed: () => context.go('/animals'),
          icon: const Icon(Icons.arrow_back),
        ),
        actions: [
          if (!animal.isMemorial)
            IconButton(
              tooltip: '編輯居民',
              onPressed: () => _editAnimal(context, ref, animal),
              icon: const Icon(Icons.edit_outlined),
            ),
          if (isOwner && !animal.isMemorial)
            PopupMenuButton<_AnimalAdminAction>(
              tooltip: '居民管理',
              onSelected: (action) {
                switch (action) {
                  case _AnimalAdminAction.transfer:
                    context.push('/animals/${animal.id}/transfer');
                  case _AnimalAdminAction.memorialize:
                    _memorializeAnimal(context, ref, animal);
                  case _AnimalAdminAction.archive:
                    _archiveAnimal(context, ref, animal);
                  case _AnimalAdminAction.delete:
                    _deleteAnimal(context, ref, animal);
                }
              },
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: _AnimalAdminAction.transfer,
                  child: Text('轉移居民'),
                ),
                PopupMenuItem(
                  value: _AnimalAdminAction.memorialize,
                  child: Text('設為紀念'),
                ),
                PopupMenuItem(
                  value: _AnimalAdminAction.archive,
                  child: Text('封存居民'),
                ),
                PopupMenuItem(
                  value: _AnimalAdminAction.delete,
                  child: Text('刪除居民', style: TextStyle(color: AppTokens.overdue)),
                ),
              ],
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 36),
        children: [
          MossCard(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                AnimalAvatar(label: animal.initial, colorHex: animal.avatarColor, pattern: animal.avatarPattern, size: 76),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(animal.name, style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 4),
                      Text(
                        [animal.displaySpecies, if (animal.morph != null) animal.morph!].join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _MetaChip(label: _sexLabel(animal.sex)),
                          if (animal.birthDate != null) _MetaChip(label: '生日 ${animal.birthDate}'),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (animal.isMemorial) ...[
            const SizedBox(height: 12),
            MossCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.local_florist_outlined, color: AppTokens.primaryStrong),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('已成為了苔間的回憶。', style: TextStyle(fontWeight: FontWeight.w700)),
                        if (animal.memorialAt != null)
                          Text(
                            formatDateTime(animal.memorialAt!, timezone),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        if (animal.memorialNote != null && animal.memorialNote!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(animal.memorialNote!),
                          ),
                        const SizedBox(height: 4),
                        Text(
                          '紀錄保留，提醒與新增照護已停止。',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (animal.notes != null && animal.notes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            MossCard(
              child: Text(animal.notes!, style: const TextStyle(height: 1.5)),
            ),
          ],
          if (isOwner && animal.isActive) ...[
            const SizedBox(height: 14),
            _RecordVisibilityCard(animal: animal),
          ],
          const SizedBox(height: 22),
          _LineageSection(animal: animal, isOwner: isOwner, lineage: lineageAsync),
          if (!animal.isMemorial) ...[
          const SizedBox(height: 22),
          const _SectionTitle(title: '快速紀錄'),
          const SizedBox(height: 10),
          MossCard(
            padding: const EdgeInsets.all(16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _QuickAction(
                  icon: Icons.restaurant_outlined,
                  label: '餵食',
                  onTap: () => QuickRecordSheet.show(context, animal: animal),
                ),
                _QuickAction(
                  icon: Icons.water_drop_outlined,
                  label: '換水',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.water),
                ),
                _QuickAction(
                  icon: Icons.monitor_weight_outlined,
                  label: '量體重',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.weight),
                ),
                _QuickAction(
                  icon: Icons.circle_outlined,
                  label: '排便',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.poop),
                ),
                _QuickAction(
                  icon: Icons.change_history,
                  label: '蛻皮',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.shed),
                ),
                _QuickAction(
                  icon: Icons.edit_note,
                  label: '備註',
                  onTap: () => QuickRecordSheet.show(context, animal: animal, initialType: RecordType.note),
                ),
              ],
            ),
          ),
          ],
          const SizedBox(height: 26),
          Row(
            children: [
              const Expanded(child: _SectionTitle(title: '提醒')),
              TextButton.icon(
                onPressed: animal.isMemorial
                    ? null
                    : () => context.push('/reminders/new?animalId=${animal.id}'),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('新增'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (reminderAsync.hasError)
            InlineBanner(
              icon: Icons.cloud_off_outlined,
              message: '讀取提醒失敗，請稍後重新整理。',
              color: AppTokens.warningBg,
            )
          else if (reminders.isEmpty)
            MossCard(
              child: Text(
                '還沒有提醒。替 ${animal.name} 設一個固定的照護時間吧。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            )
          else
            ...reminders.map(
              (reminder) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _ReminderCard(reminder: reminder, animal: animal, timezone: timezone),
              ),
            ),
          const SizedBox(height: 26),
          Row(
            children: [
              const Expanded(child: _SectionTitle(title: '最近紀錄')),
              TextButton.icon(
                onPressed: () => context.push('/animals/${animal.id}/analytics'),
                  icon: const Icon(Icons.insights_outlined, size: 18),
                  label: const Text('分析'),
                ),
            ],
          ),
          const SizedBox(height: 10),
          if (recordAsync.hasError)
            InlineBanner(
              icon: Icons.cloud_off_outlined,
              message: '讀取紀錄失敗，請稍後重新整理。',
              color: AppTokens.warningBg,
            )
          else if (records.isEmpty)
            MossCard(
              child: Text('還沒有紀錄。', style: Theme.of(context).textTheme.bodySmall),
            )
          else
            MossCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Column(
                children: [
                  for (final record in records.take(6))
                    RecordActionTile(
                      record: record,
                      animal: animal,
                      timezone: timezone,
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  static String _sexLabel(String sex) => switch (sex) {
    'female' => '母',
    'male' => '公',
    _ => '性別未知',
  };

  static Future<void> _editAnimal(BuildContext context, WidgetRef ref, Animal animal) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _AnimalEditSheet(animal: animal),
    );
    if (saved == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('居民資料已更新，會自動同步。')),
      );
    }
  }

  static Future<void> _memorializeAnimal(
    BuildContext context,
    WidgetRef ref,
    Animal animal,
  ) async {
    final controller = TextEditingController();
    final note = await showDialog<String?>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('設為紀念？'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('「${animal.name}」會移到紀念區；提醒會停用，之後不能再新增照護紀錄。這個動作無法復原。'),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              maxLines: 3,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: '想留下的話（選填）',
                alignLabelWithHint: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(null),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('設為紀念'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (note == null) return;
    try {
      await ref.read(animalRepositoryProvider).memorialize(animal, note: note);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('設定失敗：$error')),
        );
      }
      return;
    }
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已設為紀念，會自動同步。')),
    );
    context.go('/animals');
  }

  static Future<void> _archiveAnimal(
    BuildContext context,
    WidgetRef ref,
    Animal animal,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('封存居民？'),
        content: Text('「${animal.name}」會從居民列表隱藏，提醒也會停用；歷史紀錄仍保留。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppTokens.overdue),
            child: const Text('封存'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(animalRepositoryProvider).archive(animal);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('封存失敗：$error')));
      }
      return;
    }
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('居民已封存，會自動同步。')),
    );
    context.go('/animals');
  }

  static Future<void> _deleteAnimal(
    BuildContext context,
    WidgetRef ref,
    Animal animal,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除居民？'),
        content: Text('「${animal.name}」與相關提醒會一併刪除，歷史紀錄將從時間軸隱藏。此操作無法復原。'),
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
      await ref.read(animalRepositoryProvider).delete(animal);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('刪除失敗：$error')));
      }
      return;
    }
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('居民已刪除，會自動同步。')),
    );
    context.go('/animals');
  }
}



class _RecordVisibilityCard extends ConsumerStatefulWidget {
  const _RecordVisibilityCard({required this.animal});

  final Animal animal;

  @override
  ConsumerState<_RecordVisibilityCard> createState() => _RecordVisibilityCardState();
}

class _RecordVisibilityCardState extends ConsumerState<_RecordVisibilityCard> {
  bool _busy = false;

  Future<void> _toggle(bool value) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(animalRepositoryProvider).setRecordVisibility(widget.animal, isPublic: value);
      ref.invalidate(animalsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(value ? '已公開居民的照護紀錄。' : '已隱藏居民的照護紀錄。')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('更新失敗：$error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copyLink() async {
    final url = widget.animal.publicUrl;
    if (url == null) return;
    await Clipboard.setData(ClipboardData(text: url));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('公開連結已複製。')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isPublic = widget.animal.recordsPublic;
    return MossCard(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        children: [
          Row(
            children: [
              Icon(
                isPublic ? Icons.public : Icons.lock_outline,
                size: 20,
                color: isPublic ? AppTokens.primaryStrong : AppTokens.muted,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('照護紀錄公開', style: TextStyle(fontWeight: FontWeight.w800)),
                    SizedBox(height: 2),
                    Text('公開後，拿到連結的人可以唯讀查看這個居民的全部紀錄。', style: TextStyle(fontSize: 11, color: AppTokens.muted, height: 1.4)),
                  ],
                ),
              ),
              Switch(
                value: isPublic,
                onChanged: _busy ? null : _toggle,
              ),
            ],
          ),
          if (isPublic && widget.animal.publicUrl != null) ...[
            const Divider(height: 16),
            Row(
              children: [
                Icon(Icons.link, size: 16, color: AppTokens.primaryStrong),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.animal.publicUrl!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: AppTokens.muted),
                  ),
                ),
                TextButton(
                  onPressed: _copyLink,
                  child: const Text('複製'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _LineageSection extends ConsumerWidget {
  const _LineageSection({
    required this.animal,
    required this.isOwner,
    required this.lineage,
  });

  final Animal animal;
  final bool isOwner;
  final AsyncValue<LineageGraph> lineage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final graph = lineage.value ?? const LineageGraph();
    final error = lineage.hasError;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: _SectionTitle(title: '家族')),
            if (isOwner) ...[
              TextButton(
                onPressed: () => _addRelative(context, ref, asParent: true),
                child: const Text('連結父母'),
              ),
              TextButton(
                onPressed: () => _addRelative(context, ref, asParent: false),
                child: const Text('連結子代'),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        if (error)
          InlineBanner(
            icon: Icons.lock_outline,
            message: '家族資料暫時無法讀取。',
            color: AppTokens.warningBg,
          )
        else if (lineage.isLoading && graph.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: LinearProgressIndicator(minHeight: 2),
          )
        else if (graph.isEmpty)
          MossCard(
            child: Text(
              '還沒有家族連結。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          )
        else ...[
          if (graph.parents.isNotEmpty) ...[
            const _LineageLabel(label: '父母'),
            for (final relative in graph.parents)
              _LineageRow(
                relative: relative,
                isOwner: isOwner,
                onRemove: () => _removeRelative(context, ref, relative),
              ),
          ],
          if (graph.children.isNotEmpty) ...[
            const SizedBox(height: 8),
            const _LineageLabel(label: '子代'),
            for (final relative in graph.children)
              _LineageRow(
                relative: relative,
                isOwner: isOwner,
                onRemove: () => _removeRelative(context, ref, relative),
              ),
          ],
        ],
      ],
    );
  }

  Future<void> _addRelative(
    BuildContext context,
    WidgetRef ref, {
    required bool asParent,
  }) async {
    final animals = ref
        .read(activeAnimalsProvider)
        .where((candidate) => candidate.id != animal.id)
        .toList(growable: false);
    if (animals.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('需要先有另一位居民，才能建立家族連結。')),
      );
      return;
    }
    final selected = await showDialog<Animal>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(asParent ? '選擇父母' : '選擇子代'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final candidate in animals)
                ListTile(
                  leading: AnimalAvatar(
                    label: candidate.initial,
                    colorHex: candidate.avatarColor,
                    size: 38,
                  ),
                  title: Text(candidate.name),
                  subtitle: Text(candidate.displaySpecies),
                  onTap: () => Navigator.of(context).pop(candidate),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
        ],
      ),
    );
    if (selected == null || !context.mounted) return;
    try {
      await ref.read(lineageRepositoryProvider).add(
        parentId: asParent ? selected.id : animal.id,
        childId: asParent ? animal.id : selected.id,
      );
      ref.invalidate(lineageProvider(animal.id));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('家族連結已建立，會自動同步。')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('建立家族連結失敗：$error')),
        );
      }
    }
  }

  Future<void> _removeRelative(
    BuildContext context,
    WidgetRef ref,
    LineageRelative relative,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('移除家族連結？'),
        content: const Text('只會移除這條家族關係，不會刪除任何居民。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('移除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(lineageRepositoryProvider).remove(relative);
      ref.invalidate(lineageProvider(animal.id));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('家族連結已移除，會自動同步。')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('移除家族連結失敗：$error')),
        );
      }
    }
  }
}

class _LineageLabel extends StatelessWidget {
  const _LineageLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 4),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: AppTokens.muted,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _LineageRow extends StatelessWidget {
  const _LineageRow({
    required this.relative,
    required this.isOwner,
    required this.onRemove,
  });

  final LineageRelative relative;
  final bool isOwner;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final relativeId = relative.animalId;
    final accessible = relative.accessible && relativeId != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: MossCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        onTap: accessible ? () => context.push('/animals/$relativeId') : null,
        child: Row(
          children: [
            accessible
                ? AnimalAvatar(
                    label: (relative.name ?? '?').substring(0, 1),
                    colorHex: relative.avatarColor,
                    size: 42,
                  )
                : Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: AppTokens.successBg,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.lock_outline, size: 19, color: AppTokens.muted),
                  ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    accessible ? (relative.name ?? '未命名') : relative.placeholderLabel,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: accessible ? null : AppTokens.muted,
                    ),
                  ),
                  if (accessible && (relative.speciesLabel ?? '').isNotEmpty)
                    Text(
                      relative.speciesLabel!,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                ],
              ),
            ),
            if (isOwner)
              IconButton(
                tooltip: '移除家族連結',
                onPressed: onRemove,
                icon: const Icon(Icons.link_off, size: 19),
              ),
          ],
        ),
      ),
    );
  }
}

enum _AnimalAdminAction { transfer, memorialize, archive, delete }

class _AnimalEditSheet extends ConsumerStatefulWidget {
  const _AnimalEditSheet({required this.animal});

  final Animal animal;

  @override
  ConsumerState<_AnimalEditSheet> createState() => _AnimalEditSheetState();
}

class _AnimalEditSheetState extends ConsumerState<_AnimalEditSheet> {
  late final TextEditingController _name = TextEditingController(text: widget.animal.name);
  late final TextEditingController _morph = TextEditingController(text: widget.animal.morph ?? '');
  late final TextEditingController _notes = TextEditingController(text: widget.animal.notes ?? '');
  late final TextEditingController _birthDate =
      TextEditingController(text: widget.animal.birthDate ?? '');
  late final TextEditingController _adoptionDate =
      TextEditingController(text: widget.animal.adoptionDate ?? '');
  late String _speciesId = widget.animal.species;
  late String _sex = widget.animal.sex;
  late String _avatarColor = widget.animal.avatarColor;
  late String _avatarPattern = widget.animal.avatarPattern;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _morph.dispose();
    _notes.dispose();
    _birthDate.dispose();
    _adoptionDate.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = '請輸入名字');
      return;
    }
    if (name.length > 40) {
      setState(() => _error = '名字最多 40 個字');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(animalRepositoryProvider).update(
        animal: widget.animal,
        name: name,
        speciesId: _speciesId,
        morph: _morph.text,
        sex: _sex,
        notes: _notes.text,
        birthDate: _birthDate.text.trim(),
        adoptionDate: _adoptionDate.text.trim(),
        avatarColor: _avatarColor,
        avatarPattern: _avatarPattern,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) setState(() => _error = '儲存失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('編輯居民', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextField(
              controller: _name,
              maxLength: 40,
              decoration: const InputDecoration(labelText: '名字'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _morph,
              maxLength: 60,
              decoration: const InputDecoration(labelText: '基因 / 型態（選填）'),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _speciesId,
              decoration: const InputDecoration(labelText: '物種'),
              items: [
                for (final species in speciesList)
                  DropdownMenuItem(value: species.id, child: Text(species.name)),
              ],
              onChanged: (value) => setState(() => _speciesId = value ?? _speciesId),
            ),
            const SizedBox(height: 10),
            Text('性別', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'female', label: Text('母')),
                ButtonSegment(value: 'male', label: Text('公')),
                ButtonSegment(value: 'unknown', label: Text('未知')),
              ],
              selected: {_sex},
              onSelectionChanged: (value) => setState(() => _sex = value.first),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _birthDate,
                    decoration: const InputDecoration(
                      labelText: '生日（選填）',
                      hintText: 'YYYY-MM-DD',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _adoptionDate,
                    decoration: const InputDecoration(
                      labelText: '到家日（選填）',
                      hintText: 'YYYY-MM-DD',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('圖案', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'solid', label: Text('素色')),
                ButtonSegment(value: 'spots', label: Text('斑點')),
                ButtonSegment(value: 'stripes', label: Text('條紋')),
                ButtonSegment(value: 'gradient', label: Text('漸層')),
              ],
              selected: {_avatarPattern},
              onSelectionChanged: (value) => setState(() => _avatarPattern = value.first),
            ),
            const SizedBox(height: 12),
            Text('代表色', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 9,
              runSpacing: 9,
              children: [
                for (final color in AppTokens.avatarPalette)
                  Semantics(
                    selected: color == _avatarColor,
                    label: '代表色 $color',
                    child: InkWell(
                      onTap: () => setState(() => _avatarColor = color),
                      borderRadius: BorderRadius.circular(999),
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: AppTokens.colorFromHex(color),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: color == _avatarColor ? AppTokens.ink : Colors.white,
                            width: color == _avatarColor ? 3 : 2,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _notes,
              maxLines: 3,
              maxLength: 2000,
              decoration: const InputDecoration(labelText: '備註（選填）', alignLabelWithHint: true),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: AppTokens.overdue)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : const Text('儲存變更'),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                '若家人同時修改，儲存後會出現衝突提示。',
                style: TextStyle(fontSize: 11, color: AppTokens.muted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTokens.successBg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTokens.primaryStrong),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(title, style: Theme.of(context).textTheme.titleMedium);
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: AppTokens.successBg,
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppTokens.radiusSm),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 19, color: AppTokens.primaryStrong),
                const SizedBox(width: 6),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReminderCard extends ConsumerStatefulWidget {
  const _ReminderCard({required this.reminder, required this.animal, required this.timezone});

  final Reminder reminder;
  final Animal animal;
  final String timezone;

  @override
  ConsumerState<_ReminderCard> createState() => _ReminderCardState();
}

class _ReminderCardState extends ConsumerState<_ReminderCard> {
  bool _busy = false;

  Future<void> _toggle(bool value) async {
    setState(() => _busy = true);
    try {
      await ref.read(reminderRepositoryProvider).update(reminder: widget.reminder, enabled: value);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('更新失敗：$error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除提醒？'),
        content: Text('「${widget.reminder.title}」之後不會再出現在今日任務。'),
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
      await ref.read(reminderRepositoryProvider).delete(widget.reminder);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('刪除失敗：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final reminder = widget.reminder;
    return MossCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppTokens.successBg, shape: BoxShape.circle),
            child: Icon(Icons.alarm, size: 20, color: AppTokens.primaryStrong),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(reminder.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  '${reminder.schedule.label} · ${nextDueLabel(reminder)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            Switch(
              value: reminder.enabled,
              onChanged: _toggle,
            ),
          PopupMenuButton<String>(
            tooltip: '更多',
            onSelected: (value) {
              if (value == 'edit') {
                context.push('/reminders/${reminder.id}?animalId=${widget.animal.id}');
              } else if (value == 'delete') {
                _delete();
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'edit', child: Text('編輯')),
              PopupMenuItem(value: 'delete', child: Text('刪除')),
            ],
          ),
        ],
      ),
    );
  }
}
