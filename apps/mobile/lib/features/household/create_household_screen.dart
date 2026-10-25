import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/command_result.dart';
import '../../core/theme/app_theme.dart';
import '../../data/command/command_attempt.dart';
import 'household_repository.dart';

class CreateHouseholdScreen extends ConsumerStatefulWidget {
  const CreateHouseholdScreen({super.key});

  @override
  ConsumerState<CreateHouseholdScreen> createState() => _CreateHouseholdScreenState();
}

class _CreateHouseholdScreenState extends ConsumerState<CreateHouseholdScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController(text: '我的家庭');
  String _timezone = 'Asia/Taipei';
  bool _busy = false;
  String? _error;
  final _attempt = CommandAttempt();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final name = _nameController.text.trim();
      final commandId = _attempt.commandIdFor(
        'household.create',
        {'name': name, 'timezone': _timezone},
      );
      final result = await ref
          .read(householdRepositoryProvider)
          .create(name: name, timezone: _timezone, commandId: commandId);
      if (!result.ok) {
        if (mounted) setState(() => _error = commandErrorMessage(result));
        return;
      }
      _attempt.reset();
      // The profile stream updates householdIds; give it a moment, then go home.
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('家庭建立好了，開始邀請家人吧。')),
      );
      context.go('/');
    } catch (error) {
      if (mounted) setState(() => _error = '建立失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('建立家庭')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Text(
                '一個家庭，一份照顧紀錄。',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 6),
              Text(
                '建立後你會是屋主，可以邀請家人成為代管人。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 24),
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(labelText: '家庭名稱', hintText: '例如：苔間小屋'),
                validator: (value) {
                  final text = value?.trim() ?? '';
                  if (text.isEmpty) return '請輸入家庭名稱';
                  if (text.length > 40) return '名稱最多 40 個字';
                  return null;
                },
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _timezone,
                decoration: const InputDecoration(labelText: '時區'),
                items: [
                  for (final timezone in timezoneOptions)
                    DropdownMenuItem(value: timezone, child: Text(timezoneLabel(timezone))),
                ],
                onChanged: (value) => setState(() => _timezone = value ?? _timezone),
              ),
              const SizedBox(height: 8),
              const Text(
                '今日任務會依這個時區計算；之後可以在設定中調整。',
                style: TextStyle(fontSize: 11, color: AppTokens.muted, height: 1.4),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!, style: const TextStyle(color: AppTokens.overdue)),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                      )
                    : const Text('建立家庭'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
