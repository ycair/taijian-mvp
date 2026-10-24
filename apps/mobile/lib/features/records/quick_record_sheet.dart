import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import 'record_repository.dart';

class QuickRecordSheet extends ConsumerStatefulWidget {
  const QuickRecordSheet({
    super.key,
    required this.animal,
    this.initialType = RecordType.feeding,
  });

  final Animal animal;
  final RecordType initialType;

  static Future<void> show(
    BuildContext context, {
    required Animal animal,
    RecordType initialType = RecordType.feeding,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => QuickRecordSheet(animal: animal, initialType: initialType),
    );
  }

  @override
  ConsumerState<QuickRecordSheet> createState() => _QuickRecordSheetState();
}

class _QuickRecordSheetState extends ConsumerState<QuickRecordSheet> {
  static const _types = [
    RecordType.feeding,
    RecordType.water,
    RecordType.weight,
    RecordType.poop,
    RecordType.shed,
    RecordType.note,
  ];

  late RecordType _type = widget.initialType;
  late DateTime _occurredAt = _nowMinute();
  final _valueController = TextEditingController();
  final _unitController = TextEditingController(text: 'g');
  final _noteController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _valueController.dispose();
    _unitController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  static DateTime _nowMinute() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day, now.hour, now.minute);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_occurredAt),
      helpText: '紀錄時間',
      cancelText: '取消',
      confirmText: '確定',
    );
    if (picked == null) return;
    final now = DateTime.now();
    setState(() {
      _occurredAt = DateTime(now.year, now.month, now.day, picked.hour, picked.minute);
    });
  }

  Future<void> _submit() async {
    if (_busy) return;
    final needsValue = _type == RecordType.weight || _type == RecordType.custom;
    double? value;
    if (needsValue && _valueController.text.trim().isNotEmpty) {
      value = double.tryParse(_valueController.text.trim());
      if (value == null || value < 0) {
        _toast('請輸入有效的數字。');
        return;
      }
    }
    if (_type == RecordType.weight && value == null) {
      _toast('量體重時請填寫數字。');
      return;
    }
    if (_occurredAt.isAfter(DateTime.now().add(const Duration(minutes: 5)))) {
      _toast('紀錄時間不能超過現在 5 分鐘。');
      return;
    }

    setState(() => _busy = true);
    try {
      await ref
          .read(recordRepositoryProvider)
          .create(
            animalId: widget.animal.id,
            type: _type,
            occurredAt: _occurredAt,
            value: value,
            unit: needsValue ? _unitController.text.trim() : null,
            note: _noteController.text,
          );
      if (!mounted) return;
      _toast('已記下 ${widget.animal.name} 的${_type.label}。');
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      _toast('紀錄失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final needsValue = _type == RecordType.weight || _type == RecordType.custom;
    final timezone = ref.watch(householdTimezoneProvider);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('快速紀錄', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 2),
                      Text(
                        '${widget.animal.name} · ${widget.animal.displaySpecies}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: '關閉',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final type in _types)
                  ChoiceChip(
                    label: Text(type.label),
                    selected: _type == type,
                    onSelected: (_) => setState(() => _type = type),
                  ),
              ],
            ),
            const SizedBox(height: 16),
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
                      Text(formatClock(_occurredAt.toUtc(), timezone)),
                      const Spacer(),
                      TextButton(
                        onPressed: () => setState(() => _occurredAt = _nowMinute()),
                        child: const Text('現在'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (needsValue) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _valueController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(
                        labelText: _type == RecordType.weight ? '體重' : '數值',
                        hintText: _type == RecordType.weight ? '例如 62.4' : '',
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 92,
                    child: TextField(
                      controller: _unitController,
                      decoration: const InputDecoration(labelText: '單位'),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 14),
            TextField(
              controller: _noteController,
              maxLines: 3,
              maxLength: 1000,
              decoration: const InputDecoration(
                labelText: '備註（選填）',
                hintText: '吃了什麼、精神如何…',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 4),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : const Text('記下來'),
            ),
            const SizedBox(height: 8),
            const Center(
              child: Text(
                '沒有連線時會先存進佇列，恢復連線後自動同步。',
                style: TextStyle(fontSize: 11, color: AppTokens.muted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
