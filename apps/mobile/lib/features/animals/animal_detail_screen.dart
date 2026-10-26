import 'package:flutter/material.dart';
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
import '../reminders/reminder_repository.dart';

class AnimalDetailScreen extends ConsumerWidget {
  const AnimalDetailScreen({super.key, required this.animalId});

  final String animalId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final animalAsync = ref.watch(animalProvider(animalId));
    final reminderAsync = ref.watch(animalRemindersProvider(animalId));
    final recordAsync = ref.watch(animalRecordsProvider(animalId));
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
          IconButton(
            tooltip: '編輯居民',
            onPressed: () => _editAnimal(context, ref, animal),
            icon: const Icon(Icons.edit_outlined),
          ),
          if (isOwner)
            PopupMenuButton<_AnimalAdminAction>(
              tooltip: '居民管理',
              onSelected: (action) {
                switch (action) {
                  case _AnimalAdminAction.archive:
                    _archiveAnimal(context, ref, animal);
                  case _AnimalAdminAction.delete:
                    _deleteAnimal(context, ref, animal);
                }
              },
              itemBuilder: (context) => const [
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
                AnimalAvatar(label: animal.initial, colorHex: animal.avatarColor, size: 76),
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
          if (animal.notes != null && animal.notes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            MossCard(
              child: Text(animal.notes!, style: const TextStyle(height: 1.5)),
            ),
          ],
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
          const SizedBox(height: 26),
          Row(
            children: [
              const Expanded(child: _SectionTitle(title: '提醒')),
              TextButton.icon(
                onPressed: () => context.push('/reminders/new?animalId=${animal.id}'),
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
              color: const Color(0xFFFFE7D6),
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
          const _SectionTitle(title: '最近紀錄'),
          const SizedBox(height: 10),
          if (recordAsync.hasError)
            InlineBanner(
              icon: Icons.cloud_off_outlined,
              message: '讀取紀錄失敗，請稍後重新整理。',
              color: const Color(0xFFFFE7D6),
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
                    _RecordRow(record: record, timezone: timezone),
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

enum _AnimalAdminAction { archive, delete }

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
              Text(_error!, style: const TextStyle(color: AppTokens.overdue)),
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
            const Center(
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
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTokens.primaryStrong),
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
            decoration: const BoxDecoration(color: AppTokens.successBg, shape: BoxShape.circle),
            child: const Icon(Icons.alarm, size: 20, color: AppTokens.primaryStrong),
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

class _RecordRow extends StatelessWidget {
  const _RecordRow({required this.record, required this.timezone});

  final CareRecord record;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: AppTokens.successBg, shape: BoxShape.circle),
            child: Icon(_iconFor(record.type), size: 17, color: AppTokens.primaryStrong),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  record.type.label,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                if (record.summary.isNotEmpty)
                  Text(record.summary, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          Text(
            formatDateTime(record.occurredAt, timezone),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  static IconData _iconFor(RecordType type) => switch (type) {
    RecordType.feeding => Icons.restaurant_outlined,
    RecordType.water => Icons.water_drop_outlined,
    RecordType.weight => Icons.monitor_weight_outlined,
    RecordType.poop => Icons.circle_outlined,
    RecordType.shed => Icons.change_history,
    RecordType.activity => Icons.directions_run,
    RecordType.medical => Icons.medical_services_outlined,
    RecordType.note => Icons.edit_note,
    RecordType.custom => Icons.straighten,
  };
}
