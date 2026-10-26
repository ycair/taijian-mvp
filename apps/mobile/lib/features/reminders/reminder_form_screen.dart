import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import '../../core/widgets/common.dart';
import '../settings/outbox_banner.dart';
import 'reminder_repository.dart';
import 'reminder_schedule_edit.dart';

class ReminderFormScreen extends ConsumerStatefulWidget {
  const ReminderFormScreen({super.key, this.reminderId, this.animalId});

  final String? reminderId;
  final String? animalId;

  @override
  ConsumerState<ReminderFormScreen> createState() => _ReminderFormScreenState();
}

class _ReminderFormScreenState extends ConsumerState<ReminderFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _intervalController = TextEditingController(text: '7');

  String? _selectedAnimalId;
  String _type = 'feeding';
  String _scheduleKind = 'daily';
  TimeOfDay _time = const TimeOfDay(hour: 8, minute: 30);
  Set<int> _weekdays = {DateTime.now().weekday};
  bool _enabled = true;
  bool _hydrated = false;
  bool _busy = false;

  bool get _editing => widget.reminderId != null;

  @override
  void initState() {
    super.initState();
    _selectedAnimalId = widget.animalId;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _intervalController.dispose();
    super.dispose();
  }

  void _hydrate(Reminder reminder) {
    if (_hydrated) return;
    _hydrated = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final parts = reminder.schedule.time.split(':');
      setState(() {
        _titleController.text = reminder.title;
        _type = reminder.type;
        _scheduleKind = reminder.schedule.kind;
        _time = TimeOfDay(
          hour: int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 8,
          minute: int.tryParse(parts.length > 1 ? parts[1] : '') ?? 30,
        );
        _weekdays = reminder.schedule.weekdays.isEmpty
            ? {DateTime.now().weekday}
            : reminder.schedule.weekdays.toSet();
        _intervalController.text = '${reminder.schedule.everyNDays ?? 7}';
        _enabled = reminder.enabled;
        _selectedAnimalId = reminder.animalId;
      });
    });
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _time,
      helpText: '提醒時間',
      cancelText: '取消',
      confirmText: '確定',
    );
    if (picked != null) setState(() => _time = picked);
  }

  String get _clock =>
      '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}';

  ReminderSchedule _buildSchedule(Reminder? editing) {
    final everyNDays = int.tryParse(_intervalController.text.trim()) ?? 7;
    final todayKey = localDateKey(DateTime.now(), ref.read(householdTimezoneProvider));
    return ReminderSchedule(
      kind: _scheduleKind,
      times: [_clock],
      weekdays: _scheduleKind == 'weekly' ? (_weekdays.toList()..sort()) : const [],
      everyNDays: _scheduleKind == 'interval' ? everyNDays.clamp(1, 365) : null,
      startDate: _scheduleKind == 'interval'
          ? intervalStartDate(existingStartDate: editing?.schedule.startDate, today: todayKey)
          : null,
    );
  }

  Future<void> _save(Reminder? editing) async {
    if (_busy || !_formKey.currentState!.validate()) return;
    if (_scheduleKind == 'weekly' && _weekdays.isEmpty) {
      _toast('請至少選一天。');
      return;
    }
    if (!_editing && _selectedAnimalId == null) {
      _toast('請先選擇居民。');
      return;
    }

    setState(() => _busy = true);
    try {
      final repo = ref.read(reminderRepositoryProvider);
      final schedule = _buildSchedule(editing);
      if (editing != null) {
        await repo.update(
          reminder: editing,
          title: _titleController.text,
          type: _type,
          schedule: schedule,
          // Omit enabled when unchanged: the server would otherwise mark it in
          // `lastChangedFields` and hide today's earlier occurrence.
          enabled: _enabled == editing.enabled ? null : _enabled,
        );
      } else {
        final animals = ref.read(activeAnimalsProvider);
        final animal = animals.firstWhere((item) => item.id == _selectedAnimalId);
        await repo.create(
          animal: animal,
          title: _titleController.text,
          type: _type,
          schedule: schedule,
          timezone: ref.read(householdTimezoneProvider),
          enabled: _enabled,
        );
      }
      if (!mounted) return;
      _toast(editing == null ? '已新增提醒。' : '已更新提醒。');
      context.pop();
    } catch (error) {
      if (!mounted) return;
      _toast('儲存失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(Reminder reminder) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除提醒？'),
        content: const Text('刪除後就不會再產生今日任務。'),
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
      await ref.read(reminderRepositoryProvider).delete(reminder);
      if (mounted) context.pop();
    } catch (error) {
      if (mounted) _toast('刪除失敗：$error');
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final remindersAsync = ref.watch(remindersProvider);
    final animals = ref.watch(activeAnimalsProvider);
    Reminder? editing;
    if (_editing) {
      for (final reminder in remindersAsync.value ?? const <Reminder>[]) {
        if (reminder.id == widget.reminderId) editing = reminder;
      }
      if (editing != null) _hydrate(editing);
    } else if (_selectedAnimalId == null && animals.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _selectedAnimalId == null) {
          setState(() => _selectedAnimalId = animals.first.id);
        }
      });
    }

    final loading = _editing && remindersAsync.isLoading && editing == null;
    final missing = _editing && !remindersAsync.isLoading && editing == null;

    return Scaffold(
      appBar: AppBar(
        title: Text(_editing ? '編輯提醒' : '新增提醒'),
        actions: [
          if (editing != null)
            IconButton(
              tooltip: '刪除提醒',
              onPressed: () => _delete(editing!),
              icon: const Icon(Icons.delete_outline, color: AppTokens.overdue),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            const OutboxConflictPanel(),
            Expanded(
              child: loading
                  ? const LoadingView()
                  : missing
                  ? EmptyState(
                      title: '找不到提醒',
                      body: '這個提醒可能已被刪除。',
                      action: FilledButton(
                        onPressed: () => context.pop(),
                        child: const Text('返回'),
                      ),
                    )
                  : Form(
                      key: _formKey,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                        children: [
                          if (!_editing && animals.isNotEmpty) ...[
                            DropdownButtonFormField<String>(
                              initialValue: _selectedAnimalId,
                              decoration: const InputDecoration(labelText: '居民'),
                              items: [
                                for (final animal in animals)
                                  DropdownMenuItem(value: animal.id, child: Text(animal.name)),
                              ],
                              onChanged: (value) => setState(() => _selectedAnimalId = value),
                            ),
                            const SizedBox(height: 14),
                          ],
                          TextFormField(
                            controller: _titleController,
                            decoration: const InputDecoration(labelText: '提醒名稱', hintText: '例如：餵食'),
                            validator: (value) {
                              final text = value?.trim() ?? '';
                              if (text.isEmpty) return '請輸入提醒名稱';
                              if (text.length > 60) return '名稱最多 60 個字';
                              return null;
                            },
                          ),
                          const SizedBox(height: 14),
                          DropdownButtonFormField<String>(
                            initialValue: _type,
                            decoration: const InputDecoration(labelText: '類型'),
                            items: const [
                              DropdownMenuItem(value: 'feeding', child: Text('餵食')),
                              DropdownMenuItem(value: 'water', child: Text('換水')),
                              DropdownMenuItem(value: 'weight', child: Text('量體重')),
                              DropdownMenuItem(value: 'poop', child: Text('排便')),
                              DropdownMenuItem(value: 'shed', child: Text('蛻皮')),
                              DropdownMenuItem(value: 'note', child: Text('備註')),
                            ],
                            onChanged: (value) => setState(() => _type = value ?? _type),
                          ),
                          const SizedBox(height: 20),
                          Text('排程', style: Theme.of(context).textTheme.labelLarge),
                          const SizedBox(height: 8),
                          SegmentedButton<String>(
                            segments: const [
                              ButtonSegment(value: 'daily', label: Text('每天')),
                              ButtonSegment(value: 'weekly', label: Text('每週')),
                              ButtonSegment(value: 'interval', label: Text('每 N 天')),
                            ],
                            selected: {_scheduleKind},
                            onSelectionChanged: (value) => setState(() => _scheduleKind = value.first),
                          ),
                          const SizedBox(height: 12),
                          Material(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(AppTokens.radiusSm),
                            child: InkWell(
                              onTap: _pickTime,
                              borderRadius: BorderRadius.circular(AppTokens.radiusSm),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                child: Row(
                                  children: [
                                    const Icon(Icons.schedule, size: 20, color: AppTokens.primaryStrong),
                                    const SizedBox(width: 10),
                                    Text('時間 $_clock'),
                                    const Spacer(),
                                    const Icon(Icons.chevron_right, color: AppTokens.muted),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          if (_scheduleKind == 'weekly') ...[
                            const SizedBox(height: 14),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                for (var day = 1; day <= 7; day += 1)
                                  FilterChip(
                                    label: Text('週${weekdayLabel(day)}'),
                                    selected: _weekdays.contains(day),
                                    onSelected: (selected) {
                                      setState(() {
                                        if (selected) {
                                          _weekdays.add(day);
                                        } else {
                                          _weekdays.remove(day);
                                        }
                                      });
                                    },
                                  ),
                              ],
                            ),
                          ],
                          if (_scheduleKind == 'interval') ...[
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: _intervalController,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                labelText: '每隔幾天',
                                suffixText: '天',
                                helperText: '從今天開始計算',
                              ),
                              validator: (value) {
                                final number = int.tryParse(value?.trim() ?? '');
                                if (number == null || number < 1 || number > 365) {
                                  return '請輸入 1–365 天';
                                }
                                return null;
                              },
                            ),
                          ],
                          const SizedBox(height: 16),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('啟用提醒'),
                            subtitle: const Text('關閉後不會出現在今日任務，也不會發出提醒通知。'),
                            value: _enabled,
                            onChanged: (value) => setState(() => _enabled = value),
                          ),
                          const SizedBox(height: 12),
                          FilledButton(
                            onPressed: _busy ? null : () => _save(editing),
                            child: _busy
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                                  )
                                : Text(_editing ? '儲存提醒' : '建立提醒'),
                          ),
                          if (_editing) ...[
                            const SizedBox(height: 10),
                            const Text(
                              '若家人同時修改這個提醒，儲存後會出現衝突提示，讓你選擇要保留哪個版本。',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 11, color: AppTokens.muted, height: 1.4),
                            ),
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
