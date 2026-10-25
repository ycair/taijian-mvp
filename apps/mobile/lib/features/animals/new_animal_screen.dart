import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/species.dart';
import '../../core/theme/app_theme.dart';
import '../animals/animal_repository.dart';

class NewAnimalScreen extends ConsumerStatefulWidget {
  const NewAnimalScreen({super.key});

  @override
  ConsumerState<NewAnimalScreen> createState() => _NewAnimalScreenState();
}

class _NewAnimalScreenState extends ConsumerState<NewAnimalScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _morphController = TextEditingController();
  final _notesController = TextEditingController();
  String _speciesId = speciesList.first.id;
  String _sex = 'unknown';
  String _avatarColor = AppTokens.avatarPalette.first;
  bool _busy = false;

  @override
  void dispose() {
    _nameController.dispose();
    _morphController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ref.read(animalRepositoryProvider).create(
        name: _nameController.text,
        speciesId: _speciesId,
        avatarColor: _avatarColor,
        morph: _morphController.text,
        sex: _sex,
        notes: _notesController.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已新增居民，正在同步。')),
      );
      context.pop();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('新增失敗：$error')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('新增居民')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              TextFormField(
                controller: _nameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: '名字', hintText: '例如：阿肥'),
                validator: (value) {
                  final text = value?.trim() ?? '';
                  if (text.isEmpty) return '請輸入名字';
                  if (text.length > 40) return '名字最多 40 個字';
                  return null;
                },
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _speciesId,
                decoration: const InputDecoration(labelText: '物種'),
                items: [
                  for (final species in speciesList)
                    DropdownMenuItem(value: species.id, child: Text(species.name)),
                ],
                onChanged: (value) => setState(() => _speciesId = value ?? _speciesId),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _morphController,
                decoration: const InputDecoration(labelText: '基因 / 型態（選填）', hintText: '例如：Hypo'),
              ),
              const SizedBox(height: 18),
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
              const SizedBox(height: 20),
              Text('代表色', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final color in AppTokens.avatarPalette)
                    Semantics(
                      selected: color == _avatarColor,
                      label: '代表色 $color',
                      child: InkWell(
                        onTap: () => setState(() => _avatarColor = color),
                        borderRadius: BorderRadius.circular(999),
                        child: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: AppTokens.colorFromHex(color),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: color == _avatarColor ? AppTokens.ink : Colors.white,
                              width: color == _avatarColor ? 3 : 2,
                            ),
                          ),
                          child: color == _avatarColor
                              ? const Icon(Icons.check, color: Colors.white, size: 20)
                              : null,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: _notesController,
                maxLines: 3,
                maxLength: 2000,
                decoration: const InputDecoration(labelText: '備註（選填）', alignLabelWithHint: true),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                      )
                    : const Text('建立居民'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
