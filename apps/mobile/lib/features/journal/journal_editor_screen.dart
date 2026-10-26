
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../../app/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/app_time.dart';
import '../../core/widgets/common.dart';
import 'journal_models.dart';
import 'journal_repository.dart';
import 'journal_screen.dart';

class JournalEditorScreen extends ConsumerStatefulWidget {
  const JournalEditorScreen({super.key, this.entryId});

  final String? entryId;

  @override
  ConsumerState<JournalEditorScreen> createState() => _JournalEditorScreenState();
}

class _JournalEditorScreenState extends ConsumerState<JournalEditorScreen> {
  final _titleController = TextEditingController();
  final _bodyController = TextEditingController();
  final _picker = ImagePicker();
  final _drafts = <_PhotoDraft>[];
  final _selectedAnimalIds = <String>{};
  DateTime _date = DateTime.now();
  String? _coverToken;
  String _visibility = 'household';
  bool _hydrated = false;
  bool _busy = false;

  bool get _editing => widget.entryId != null;

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    for (final draft in _drafts) {
      draft.caption.dispose();
    }
    super.dispose();
  }

  void _hydrate(JournalEntry entry) {
    if (_hydrated) return;
    _hydrated = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() {
        _titleController.text = entry.title;
        _bodyController.text = entry.body;
        _date = DateTime.tryParse(entry.journalDate) ?? DateTime.now();
        _selectedAnimalIds
          ..clear()
          ..addAll(entry.animalIds);
        _drafts
          ..clear()
          ..addAll(entry.photos.map((photo) => _PhotoDraft.existing(photo)));
        _coverToken = entry.coverPath ?? (entry.photos.isEmpty ? null : entry.photos.first.path);
        _visibility = entry.visibility;
      });
    });
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
      helpText: '旅程日期',
      cancelText: '取消',
      confirmText: '確定',
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickPhotos() async {
    final remaining = 5 - _drafts.length;
    if (remaining <= 0) return;
    try {
      final files = await _picker.pickMultiImage(
        imageQuality: 82,
        maxWidth: 1600,
        limit: remaining,
      );
      if (!mounted || files.isEmpty) return;
      setState(() {
        for (final file in files.take(remaining)) {
          _drafts.add(_PhotoDraft.pending(file));
        }
        _coverToken ??= _drafts.first.token;
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('選照片失敗：$error')));
      }
    }
  }

  Future<void> _save() async {
    if (_busy) return;
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      _toast('請輸入旅程標題。');
      return;
    }
    if (_drafts.isEmpty) {
      _toast('請至少加入一張照片。');
      return;
    }
    setState(() => _busy = true);
    try {
      final repository = ref.read(journalRepositoryProvider);
      final entry = _editing ? ref.read(journalEntryProvider(widget.entryId!)).value : null;
      final journalId = entry?.id ?? const Uuid().v4();
      final photos = <JournalPhoto>[];
      final uploadedPaths = <String>[];
      var coverPath = _coverToken != null && !_coverToken!.startsWith('pending:') ? _coverToken : null;
      final initialPaths = {
        for (final draft in _drafts)
          if (draft.existing != null) draft.existing!.path,
      };

      for (var index = 0; index < _drafts.length; index++) {
        final draft = _drafts[index];
        if (draft.pending != null) {
          final uploaded = await repository.uploadPhoto(journalId, draft.pending!);
          uploadedPaths.add(uploaded.path);
          photos.add(JournalPhoto(path: uploaded.path, caption: draft.caption.text.trim()));
          if (_coverToken == draft.token) coverPath = uploaded.path;
        } else if (draft.existing != null) {
          photos.add(JournalPhoto(path: draft.existing!.path, caption: draft.caption.text.trim()));
          if (_coverToken == draft.token) coverPath = draft.existing!.path;
        }
      }
      coverPath ??= photos.isEmpty ? null : photos.first.path;
      final dateKey = formatDateKey(_date.year, _date.month, _date.day);
      if (entry == null) {
        await repository.create(
          journalId: journalId,
          title: title,
          body: _bodyController.text,
          journalDate: dateKey,
          animalIds: _selectedAnimalIds.toList(growable: false),
          photos: photos,
          coverPath: coverPath,
          visibility: _visibility,
        );
      } else {
        await repository.update(
          entry: entry,
          title: title,
          body: _bodyController.text,
          journalDate: dateKey,
          animalIds: _selectedAnimalIds.toList(growable: false),
          photos: photos,
          coverPath: coverPath,
          visibility: _visibility,
        );
        for (final path in initialPaths) {
          if (!photos.any((photo) => photo.path == path)) await repository.deletePhoto(path);
        }
      }
      ref.invalidate(journalEntriesProvider);
      if (!mounted) return;
      context.pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(entry == null ? '旅程已建立。' : '旅程已更新。')),
      );
    } catch (error) {
      if (mounted) _toast('儲存旅程失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final entryAsync = _editing ? ref.watch(journalEntryProvider(widget.entryId!)) : null;
    final entry = entryAsync?.value;
    if (_editing && entry != null) _hydrate(entry);
    final animals = ref.watch(activeAnimalsProvider);
    final loading = _editing && entryAsync!.isLoading && entry == null;
    final missing = _editing && !entryAsync!.isLoading && entry == null;

    return Scaffold(
      appBar: AppBar(
        title: Text(_editing ? '編輯旅程' : '寫下旅程'),
        actions: [
          TextButton(
            onPressed: _busy ? null : _save,
            child: Text(_busy ? '儲存中…' : '儲存'),
          ),
        ],
      ),
      body: loading
          ? const LoadingView()
          : missing
              ? EmptyState(
                  title: '找不到旅程',
                  body: '這篇旅程可能已被刪除。',
                  action: FilledButton(onPressed: () => context.pop(), child: const Text('返回')),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
                  children: [
                    TextField(
                      controller: _titleController,
                      maxLength: 80,
                      decoration: const InputDecoration(labelText: '旅程標題'),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _bodyController,
                      minLines: 4,
                      maxLines: 10,
                      maxLength: 5000,
                      decoration: const InputDecoration(
                        labelText: '寫下這次的照顧與觀察',
                        alignLabelWithHint: true,
                      ),
                    ),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: _pickDate,
                      borderRadius: BorderRadius.circular(AppTokens.radiusSm),
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: '日期'),
                        child: Row(
                          children: [
                            const Icon(Icons.calendar_today_outlined, size: 18),
                            const SizedBox(width: 8),
                            Text(formatDateKey(_date.year, _date.month, _date.day)),
                            const Spacer(),
                            const Icon(Icons.chevron_right, color: AppTokens.muted),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text('主角', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final animal in animals)
                          FilterChip(
                            label: Text(animal.name),
                            selected: _selectedAnimalIds.contains(animal.id),
                            onSelected: (selected) => setState(() {
                              if (selected) {
                                _selectedAnimalIds.add(animal.id);
                              } else {
                                _selectedAnimalIds.remove(animal.id);
                              }
                            }),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text('誰可以看到', style: Theme.of(context).textTheme.labelLarge),
                    const SizedBox(height: 8),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'household', label: Text('家庭')),
                        ButtonSegment(value: 'link', label: Text('連結')),
                        ButtonSegment(value: 'public', label: Text('公開')),
                      ],
                      selected: {_visibility},
                      onSelectionChanged: (value) => setState(() => _visibility = value.first),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      switch (_visibility) {
                        'link' => '只有拿到連結的人可以讀取，不會出現在公開 feed。',
                        'public' => '會出現在公開旅程 feed；發布前請確認照片與文字可以公開。',
                        _ => '只有家庭成員可以讀取。',
                      },
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Text('照片', style: Theme.of(context).textTheme.labelLarge),
                        const Spacer(),
                        Text('${_drafts.length} / 5', style: Theme.of(context).textTheme.bodySmall),
                        TextButton.icon(
                          onPressed: _drafts.length >= 5 ? null : _pickPhotos,
                          icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
                          label: const Text('加入'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    for (var index = 0; index < _drafts.length; index++)
                      _PhotoDraftCard(
                        draft: _drafts[index],
                        index: index,
                        isCover: _coverToken == _drafts[index].token,
                        onCover: () => setState(() => _coverToken = _drafts[index].token),
                        onRemove: () => setState(() {
                          final removed = _drafts.removeAt(index);
                          removed.caption.dispose();
                          if (_coverToken == removed.token) {
                            _coverToken = _drafts.isEmpty ? null : _drafts.first.token;
                          }
                        }),
                      ),
                    if (_drafts.isEmpty)
                      MossCard(
                        child: Text(
                          '一篇旅程最多 5 張照片。選一張當封面，其餘會排成照片盒。',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _save,
                      child: Text(_busy ? '儲存中…' : '儲存旅程'),
                    ),
                  ],
                ),
    );
  }
}

class _PhotoDraft {
  _PhotoDraft.existing(JournalPhoto photo)
      : existing = photo,
        pending = null,
        caption = TextEditingController(text: photo.caption);

  _PhotoDraft.pending(XFile file)
      : existing = null,
        pending = file,
        caption = TextEditingController();

  final JournalPhoto? existing;
  final XFile? pending;
  final TextEditingController caption;

  String get token => existing?.path ?? 'pending:${pending!.path}';
}

class _PhotoDraftCard extends StatelessWidget {
  const _PhotoDraftCard({
    required this.draft,
    required this.index,
    required this.isCover,
    required this.onCover,
    required this.onRemove,
  });

  final _PhotoDraft draft;
  final int index;
  final bool isCover;
  final VoidCallback onCover;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: MossCard(
        padding: const EdgeInsets.all(10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AppTokens.radiusSm),
              child: SizedBox(
                width: 88,
                height: 88,
                child: draft.existing != null
                    ? JournalPhotoImage(path: draft.existing!.path)
                    : FutureBuilder(
                        future: draft.pending!.readAsBytes(),
                        builder: (context, snapshot) {
                          if (!snapshot.hasData) return const ColoredBox(color: AppTokens.successBg);
                          return Image.memory(snapshot.data!, fit: BoxFit.cover);
                        },
                      ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                children: [
                  TextField(
                    controller: draft.caption,
                    maxLength: 200,
                    decoration: InputDecoration(
                      hintText: '照片說明（選填）',
                      counterText: '',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      isDense: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      FilterChip(
                        label: const Text('封面'),
                        selected: isCover,
                        onSelected: (_) => onCover(),
                      ),
                      const Spacer(),
                      IconButton(
                        tooltip: '移除照片',
                        onPressed: onRemove,
                        icon: const Icon(Icons.close, size: 18),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
