import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/command_result.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'public_journal_models.dart';
import 'public_journal_repository.dart';
import 'public_journal_widgets.dart';

class PublicJournalFeedView extends ConsumerStatefulWidget {
  const PublicJournalFeedView({super.key});

  @override
  ConsumerState<PublicJournalFeedView> createState() => _PublicJournalFeedViewState();
}

class _PublicJournalFeedViewState extends ConsumerState<PublicJournalFeedView> {
  List<PublicJournalEntry>? _entries;
  String? _error;
  bool _loading = true;
  bool _busy = false;
  bool _followingOnly = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool showLoading = true}) async {
    if (showLoading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final entries = await ref
          .read(publicJournalRepositoryProvider)
          .fetchFeed(followingOnly: _followingOnly);
      if (!mounted) return;
      setState(() {
        _entries = entries;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = _message(error);
        _loading = false;
      });
    }
  }

  Future<void> _like(PublicJournalEntry entry) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(publicJournalRepositoryProvider).toggleLike(entry.id);
      if (!mounted) return;
      if (!result.ok) {
        _toast(commandErrorMessage(result));
        return;
      }
      final liked = result.data?['liked'] == true;
      final likeCount = (result.data?['likeCount'] as num?)?.toInt() ?? entry.likeCount;
      _replace(entry.copyWith(liked: liked, likeCount: likeCount));
    } catch (error) {
      if (mounted) _toast(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _follow(PublicJournalEntry entry) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(publicJournalRepositoryProvider).toggleFollow(entry.authorId);
      if (!mounted) return;
      if (!result.ok) {
        _toast(commandErrorMessage(result));
        return;
      }
      final following = result.data?['following'] == true;
      setState(() {
        _entries = [
          for (final item in _entries ?? const <PublicJournalEntry>[])
            if (!_followingOnly || following || item.authorId != entry.authorId)
              item.authorId == entry.authorId ? item.copyWith(following: following) : item,
        ];
      });
    } catch (error) {
      if (mounted) _toast(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _block(PublicJournalEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('封鎖 ${entry.authorName}？'),
        content: const Text('你將看不到對方的公開旅程，直到解除封鎖。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppTokens.overdue),
            child: const Text('封鎖'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(publicJournalRepositoryProvider).toggleBlock(entry.authorId);
      if (!mounted) return;
      if (!result.ok) {
        _toast(commandErrorMessage(result));
        return;
      }
      setState(() {
        _entries = [
          for (final item in _entries ?? const <PublicJournalEntry>[])
            if (item.authorId != entry.authorId) item,
        ];
      });
      _toast('已封鎖 ${entry.authorName}。');
    } catch (error) {
      if (mounted) _toast(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _report(PublicJournalEntry entry) async {
    final reason = await _askReportReason();
    if (reason == null || !mounted) return;
    try {
      final result = await ref.read(publicJournalRepositoryProvider).reportEntry(entry.id, reason);
      if (!mounted) return;
      _toast(result.ok ? '已送出檢舉，謝謝你。' : commandErrorMessage(result));
    } catch (error) {
      if (mounted) _toast(_message(error));
    }
  }

  Future<String?> _askReportReason() async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('檢舉這篇旅程'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 500,
          minLines: 3,
          maxLines: 5,
          decoration: const InputDecoration(
            hintText: '請簡短說明檢舉原因',
            alignLabelWithHint: true,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () {
              final text = controller.text.trim();
              if (text.isNotEmpty) Navigator.of(context).pop(text);
            },
            child: const Text('送出檢舉'),
          ),
        ],
      ),
    );
    controller.dispose();
    return value;
  }

  Future<void> _open(PublicJournalEntry entry) async {
    if (entry.shareToken.isEmpty) return;
    await context.push('/journal/public/${entry.shareToken}');
    if (mounted) await _load(showLoading: false);
  }

  void _replace(PublicJournalEntry entry) {
    setState(() {
      _entries = [
        for (final item in _entries ?? const <PublicJournalEntry>[])
          item.id == entry.id ? entry : item,
      ];
    });
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String _message(Object error) {
    if (error is PublicJournalException) return error.message;
    return '讀取公開旅程失敗，請檢查網路後再試。';
  }

  @override
  Widget build(BuildContext context) {
    final currentUid = ref.watch(currentUserProvider)?.uid;
    final entries = _entries ?? const <PublicJournalEntry>[];
    if (_loading && _entries == null) return const LoadingView(label: '載入公開旅程…');
    if (_error != null && _entries == null) {
      return ErrorView(message: _error!, onRetry: _load);
    }
    return RefreshIndicator(
      color: AppTokens.primary,
      onRefresh: () => _load(showLoading: false),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
        children: [
          const PageHeader(
            kicker: 'Public journal',
            title: '探索旅程',
            subtitle: '由苔間家庭主動公開的照護片段。',
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            children: [
              ChoiceChip(
                label: const Text('全部'),
                selected: !_followingOnly,
                onSelected: (_) {
                  if (_followingOnly) {
                    setState(() => _followingOnly = false);
                    _load();
                  }
                },
              ),
              ChoiceChip(
                label: const Text('追蹤中'),
                selected: _followingOnly,
                onSelected: (_) {
                  if (!_followingOnly) {
                    setState(() => _followingOnly = true);
                    _load();
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: InlineBanner(
                icon: Icons.cloud_off_outlined,
                message: _error!,
                trailing: TextButton(onPressed: _load, child: const Text('重試')),
              ),
            ),
          if (entries.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 24),
              child: EmptyState(
                title: '目前沒有公開旅程',
                body: '當家庭把旅程設為公開，就會出現在這裡。',
              ),
            )
          else
            for (final entry in entries)
              PublicJournalEntryCard(
                entry: entry,
                isSelf: entry.authorId == currentUid,
                onOpen: () => _open(entry),
                onLike: () => _like(entry),
                onFollow: () => _follow(entry),
                onBlock: () => _block(entry),
                onReport: () => _report(entry),
              ),
        ],
      ),
    );
  }
}
