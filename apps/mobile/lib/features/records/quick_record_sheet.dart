import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    this.record,
  });

  final Animal animal;
  final RecordType initialType;
  final CareRecord? record;

  static Future<void> show(
    BuildContext context, {
    required Animal animal,
    RecordType initialType = RecordType.feeding,
    CareRecord? record,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => QuickRecordSheet(
        animal: animal,
        initialType: initialType,
        record: record,
      ),
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
    RecordType.length,
    RecordType.poop,
    RecordType.shed,
    RecordType.activity,
    RecordType.medical,
    RecordType.note,
    RecordType.custom,
  ];

  late RecordType _type;
  late DateTime _occurredAt;
  late final TextEditingController _valueController;
  late final TextEditingController _unitController;
  late final TextEditingController _noteController;
  late final TextEditingController _foodController;
  late final TextEditingController _quantityController;
  late final TextEditingController _medicationController;
  late final TextEditingController _dosageController;
  late final TextEditingController _labelController;
  late bool _refused;
  late String _activityLevel;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final record = widget.record;
    _type = record?.type ?? widget.initialType;
    final local = (record?.occurredAt ?? DateTime.now()).toLocal();
    _occurredAt = DateTime(local.year, local.month, local.day, local.hour, local.minute);
    _valueController = TextEditingController(text: _numberText(record?.value));
    _unitController = TextEditingController(
      text: record?.unit ?? (_type == RecordType.length ? 'cm' : 'g'),
    );
    _noteController = TextEditingController(text: record?.note ?? '');
    _foodController = TextEditingController(
      text: record?.metadata['food'] is String ? record!.metadata['food'] as String : '',
    );
    _quantityController = TextEditingController(
      text: record?.metadata['quantity'] is num
          ? (record!.metadata['quantity'] as num).toInt().toString()
          : '',
    );
    _medicationController = TextEditingController(
      text: record?.metadata['medication'] is String ? record!.metadata['medication'] as String : '',
    );
    _dosageController = TextEditingController(
      text: record?.metadata['dosage'] is String ? record!.metadata['dosage'] as String : '',
    );
    _labelController = TextEditingController(
      text: record?.metadata['label'] is String ? record!.metadata['label'] as String : '',
    );
    _refused = record?.metadata['refused'] == true;
    _activityLevel = record?.metadata['activityLevel'] is String
        ? record!.metadata['activityLevel'] as String
        : 'normal';
  }

  @override
  void dispose() {
    _valueController.dispose();
    _unitController.dispose();
    _noteController.dispose();
    _foodController.dispose();
    _quantityController.dispose();
    _medicationController.dispose();
    _dosageController.dispose();
    _labelController.dispose();
    super.dispose();
  }

  static String _numberText(double? value) {
    if (value == null) return '';
    return value == value.roundToDouble() ? value.toInt().toString() : value.toString();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _occurredAt,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
      helpText: '紀錄日期',
      cancelText: '取消',
      confirmText: '確定',
    );
    if (picked == null) return;
    setState(() {
      _occurredAt = DateTime(
        picked.year,
        picked.month,
        picked.day,
        _occurredAt.hour,
        _occurredAt.minute,
      );
    });
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
    setState(() {
      _occurredAt = DateTime(
        _occurredAt.year,
        _occurredAt.month,
        _occurredAt.day,
        picked.hour,
        picked.minute,
      );
    });
  }

  Map<String, dynamic> _metadata() {
    final metadata = <String, dynamic>{};
    switch (_type) {
      case RecordType.feeding:
        if (_foodController.text.trim().isNotEmpty) {
          metadata['food'] = _foodController.text.trim();
        }
        final quantity = int.tryParse(_quantityController.text.trim());
        if (quantity != null && quantity > 0) metadata['quantity'] = quantity;
        if (_refused) metadata['refused'] = true;
      case RecordType.activity:
        metadata['activityLevel'] = _activityLevel;
      case RecordType.medical:
        if (_medicationController.text.trim().isNotEmpty) {
          metadata['medication'] = _medicationController.text.trim();
        }
        if (_dosageController.text.trim().isNotEmpty) {
          metadata['dosage'] = _dosageController.text.trim();
        }
      case RecordType.custom:
        if (_labelController.text.trim().isNotEmpty) {
          metadata['label'] = _labelController.text.trim();
        }
      case RecordType.water:
      case RecordType.weight:
      case RecordType.length:
      case RecordType.poop:
      case RecordType.shed:
      case RecordType.note:
        break;
    }
    return metadata;
  }

  Future<void> _submit() async {
    if (_busy) return;
    final needsValue = _type.needsValue;
    double? value;
    if (needsValue && _valueController.text.trim().isNotEmpty) {
      value = double.tryParse(_valueController.text.trim());
      if (value == null || value < 0) {
        _toast('請輸入有效的數字。');
        return;
      }
    }
    if ((_type == RecordType.weight || _type == RecordType.length) && value == null) {
      _toast(_type == RecordType.weight ? '量體重時請填寫數字。' : '量身長時請填寫數字。');
      return;
    }
    if (_occurredAt.isAfter(DateTime.now().add(const Duration(minutes: 5)))) {
      _toast('紀錄時間不能超過現在 5 分鐘。');
      return;
    }

    setState(() => _busy = true);
    try {
      final repository = ref.read(recordRepositoryProvider);
      if (widget.record != null) {
        await repository.update(
          record: widget.record!,
          type: _type,
          occurredAt: _occurredAt,
          value: value,
          unit: needsValue ? _unitController.text.trim() : null,
          note: _noteController.text,
          metadata: _metadata(),
        );
      } else {
        await repository.create(
          animalId: widget.animal.id,
          type: _type,
          occurredAt: _occurredAt,
          value: value,
          unit: needsValue ? _unitController.text.trim() : null,
          note: _noteController.text,
          metadata: _metadata(),
        );
      }
      if (!mounted) return;
      _toast(widget.record == null
          ? '已記下 ${widget.animal.name} 的${_type.label}。'
          : '已更新 ${widget.animal.name} 的${_type.label}。');
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
    final needsValue = _type.needsValue;
    final timezone = ref.watch(householdTimezoneProvider);
    final editing = widget.record != null;

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
                      Text(editing ? '編輯紀錄' : '快速紀錄', style: Theme.of(context).textTheme.titleLarge),
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
                    onSelected: (_) => setState(() {
                      _type = type;
                      if (type == RecordType.length) _unitController.text = 'cm';
                      if (type == RecordType.weight) _unitController.text = 'g';
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _DateTimeButton(
                    icon: Icons.calendar_today_outlined,
                    label: formatDateTime(_occurredAt.toUtc(), timezone).split(' ').first,
                    onTap: _pickDate,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _DateTimeButton(
                    icon: Icons.schedule,
                    label: formatClock(_occurredAt.toUtc(), timezone),
                    onTap: _pickTime,
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() => _occurredAt = DateTime.now()),
                  child: const Text('現在'),
                ),
              ],
            ),
            if (_type == RecordType.feeding) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _foodController,
                decoration: const InputDecoration(
                  labelText: '食物（選填）',
                  hintText: '例如：蟋蟀、杜比亞',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _quantityController,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(
                  labelText: '數量（選填）',
                  hintText: '例如：3',
                  suffixText: '隻 / 份',
                ),
              ),
              const SizedBox(height: 4),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('這次拒食'),
                value: _refused,
                onChanged: (value) => setState(() => _refused = value),
              ),
            ],
            if (needsValue) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _valueController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(
                        labelText: _type == RecordType.weight
                            ? '體重'
                            : _type == RecordType.length
                                ? '身長'
                                : '數值',
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
            if (_type == RecordType.custom) ...[
              const SizedBox(height: 14),
              TextField(
                controller: _labelController,
                decoration: const InputDecoration(
                  labelText: '測量名稱（選填）',
                  hintText: '例如：尾長、頭幅',
                ),
              ),
            ],
            if (_type == RecordType.activity) ...[
              const SizedBox(height: 14),
              Text('活動力', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'normal', label: Text('正常')),
                  ButtonSegment(value: 'low', label: Text('偏低')),
                  ButtonSegment(value: 'high', label: Text('偏高')),
                ],
                selected: {_activityLevel},
                onSelectionChanged: (value) => setState(() => _activityLevel = value.first),
              ),
            ],
            if (_type == RecordType.medical) ...[
              const SizedBox(height: 14),
              TextField(
                controller: _medicationController,
                decoration: const InputDecoration(
                  labelText: '藥名 / 處置（選填）',
                  hintText: '例如：驅蟲藥',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _dosageController,
                decoration: const InputDecoration(labelText: '劑量（選填）'),
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
                  : Text(editing ? '儲存變更' : '記下來'),
            ),
            const SizedBox(height: 8),
            Center(
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

class _DateTimeButton extends StatelessWidget {
  const _DateTimeButton({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTokens.card,
      borderRadius: BorderRadius.circular(AppTokens.radiusSm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
          child: Row(
            children: [
              Icon(icon, size: 18, color: AppTokens.primaryStrong),
              const SizedBox(width: 8),
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          ),
        ),
      ),
    );
  }
}
