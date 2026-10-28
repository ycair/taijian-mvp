import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/providers.dart';
import '../../core/models/command_result.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'public_journal_models.dart';
import 'public_journal_repository.dart';
import 'public_journal_widgets.dart';

class PublicJournalDetailScreen extends ConsumerStatefulWidget {
  const PublicJournalDetailScreen({super.key, required this.token});

  final String token;

  @override
  ConsumerState<PublicJournalDetailScreen> createState() => _PublicJournalDetailScreenState();
}

class _PublicJournalDetailScreenState extends ConsumerState<PublicJournalDetailScreen> {
  final _commentController = TextEditingController();
  PublicJournalEntry? _entry;
  String? _error;
  bool _loading = true;
  bool _busy = false;
  bool _sendingComment = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final entry = await ref.read(publicJournalRepositoryProvider).fetchEntry(widget.token);
      if (!mounted) return;
      setState(() {
        _entry = entry;
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

  Future<void> _like() async {
    final entry = _entry;
    if (entry == null || _busy) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(publicJournalRepositoryProvider).toggleLike(entry.id);
      if (!mounted) return;
      if (!result.ok) {
        _toast(commandErrorMessage(result));
        return;
      }
      setState(() {
        _entry = entry.copyWith(
          liked: result.data?['liked'] == true,
          likeCount: (result.data?['likeCount'] as num?)?.toInt() ?? entry.likeCount,
        );
      });
    } catch (error) {
      if (mounted) _toast(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _follow() async {
    final entry = _entry;
    if (entry == null || _busy) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(publicJournalRepositoryProvider).toggleFollow(entry.authorId);
      if (!mounted) return;
      if (!result.ok) {
        _toast(commandErrorMessage(result));
        return;
      }
      setState(() {
        _entry = entry.copyWith(following: result.data?['following'] == true);
      });
    } catch (error) {
      if (mounted) _toast(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _block() async {
    final entry = _entry;
    if (entry == null || _busy) return;
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
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) _toast(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _report() async {
    final entry = _entry;
    if (entry == null) return;
    final controller = TextEditingController();
    final reason = await showDialog<String>(
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
    if (reason == null || !mounted) return;
    try {
      final result = await ref.read(publicJournalRepositoryProvider).reportEntry(entry.id, reason);
      if (mounted) _toast(result.ok ? '已送出檢舉，謝謝你。' : commandErrorMessage(result));
    } catch (error) {
      if (mounted) _toast(_message(error));
    }
  }

  Future<void> _sendComment() async {
    final entry = _entry;
    final body = _commentController.text.trim();
    if (entry == null || body.isEmpty || _sendingComment) return;
    if (body.length > 1000) {
      _toast('留言最多 1000 字。');
      return;
    }
    setState(() => _sendingComment = true);
    try {
      final result = await ref.read(publicJournalRepositoryProvider).addComment(entry.id, body);
      if (!mounted) return;
      if (!result.ok) {
        _toast(commandErrorMessage(result));
        return;
      }
      final user = ref.read(currentUserProvider);
      final comment = PublicJournalComment(
        id: result.data?['commentId'] as String? ?? 'local-${DateTime.now().microsecondsSinceEpoch}',
        body: body,
        createdAt: DateTime.now().toUtc(),
        authorName: user?.displayName ?? '我',
      );
      _commentController.clear();
      setState(() {
        _entry = entry.copyWith(
          comments: [...entry.comments, comment],
          commentCount: entry.commentCount + 1,
        );
      });
      FocusScope.of(context).unfocus();
    } catch (error) {
      if (mounted) _toast(_message(error));
    } finally {
      if (mounted) setState(() => _sendingComment = false);
    }
  }

  Future<void> _share() async {
    final entry = _entry;
    if (entry == null) return;
    try {
      await SharePlus.instance.share(
        ShareParams(
          text: [
            '苔間旅程 · ${entry.title}',
            entry.dateLabel,
            '',
            entry.body,
            '',
            entry.publicUrl,
          ].join('\n'),
          subject: entry.title,
        ),
      );
    } catch (_) {
      // The system share sheet can be unavailable on simulators.
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String _message(Object error) {
    if (error is PublicJournalException) return error.message;
    return '讀取旅程失敗，請檢查網路後再試。';
  }

  @override
  Widget build(BuildContext context) {
    final entry = _entry;
    final currentUid = ref.watch(currentUserProvider)?.uid;
    final isSelf = entry?.authorId == currentUid;
    return Scaffold(
      appBar: AppBar(
        title: const Text('公開旅程'),
        actions: [
          if (entry != null)
            IconButton(
              tooltip: '分享旅程',
              onPressed: _share,
              icon: const Icon(Icons.ios_share),
            ),
          if (entry != null && !isSelf)
            PopupMenuButton<String>(
              tooltip: '旅程選項',
              onSelected: (value) {
                if (value == 'report') _report();
                if (value == 'block') _block();
              },
              itemBuilder: (context) => const [
                PopupMenuItem(value: 'report', child: Text('檢舉這篇旅程')),
                PopupMenuItem(
                  value: 'block',
                  child: Text('封鎖作者', style: TextStyle(color: AppTokens.overdue)),
                ),
              ],
            ),
        ],
      ),
      body: _loading && entry == null
          ? const LoadingView()
          : _error != null && entry == null
          ? ErrorView(message: _error!, onRetry: _load)
          : entry == null
          ? const EmptyState(title: '找不到旅程', body: '這篇旅程可能已刪除或不再公開。')
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
              children: [
                if (entry.coverUrl != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppTokens.radiusLg),
                    child: AspectRatio(
                      aspectRatio: 4 / 3,
                      child: PublicJournalPhotoImage(url: entry.coverUrl),
                    ),
                  ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    PublicJournalAuthorAvatar(
                      name: entry.authorName,
                      avatarUrl: entry.authorAvatar,
                      radius: 18,
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            entry.authorName,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                          ),
                          Text(entry.dateLabel, style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                    if (!isSelf)
                      TextButton(
                        onPressed: _busy ? null : _follow,
                        child: Text(entry.following ? '已追蹤' : '追蹤作者'),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(entry.title, style: Theme.of(context).textTheme.headlineSmall),
                if (entry.body.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(entry.body, style: const TextStyle(height: 1.7, fontSize: 15)),
                ],
                if (entry.residents.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final resident in entry.residents)
                        Chip(
                          avatar: CircleAvatar(
                            backgroundColor: AppTokens.colorFromHex(resident.avatarColor),
                            child: Text(
                              resident.name.isEmpty ? '?' : resident.name.substring(0, 1),
                              style: const TextStyle(fontSize: 10),
                            ),
                          ),
                          label: Text('${resident.name} · ${resident.speciesLabel ?? '居民'}'),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: 18),
                Row(
                  children: [
                    TextButton.icon(
                      onPressed: _busy ? null : _like,
                      icon: Icon(
                        entry.liked ? Icons.favorite : Icons.favorite_border,
                        size: 21,
                        color: entry.liked ? AppTokens.overdue : AppTokens.primaryStrong,
                      ),
                      label: Text('${entry.likeCount}'),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${entry.commentCount} 則留言',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text('照片盒', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (entry.photos.isEmpty)
                  Text('這篇旅程沒有照片。', style: Theme.of(context).textTheme.bodySmall)
                else
                  for (final photo in entry.photos)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(AppTokens.radiusMd),
                            child: AspectRatio(
                              aspectRatio: 4 / 3,
                              child: PublicJournalPhotoImage(url: photo.url),
                            ),
                          ),
                          if (photo.caption.isNotEmpty) ...[
                            const SizedBox(height: 5),
                            Text(photo.caption, style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ],
                      ),
                    ),
                const SizedBox(height: 8),
                Text('留言 · ${entry.commentCount}', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (entry.comments.isEmpty)
                  Text('還沒有留言。', style: Theme.of(context).textTheme.bodySmall)
                else
                  for (final comment in entry.comments)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(AppTokens.radiusMd),
                          border: Border.all(color: AppTokens.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    comment.authorName,
                                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                                  ),
                                ),
                                Text(
                                  _shortDate(comment.createdAt),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(comment.body, style: const TextStyle(height: 1.5)),
                          ],
                        ),
                      ),
                    ),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _commentController,
                        maxLength: 1000,
                        minLines: 1,
                        maxLines: 4,
                        textInputAction: TextInputAction.newline,
                        decoration: const InputDecoration(
                          hintText: '寫下留言…',
                          counterText: '',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _sendingComment ? null : _sendComment,
                      style: FilledButton.styleFrom(minimumSize: const Size(64, 48)),
                      child: _sendingComment
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('送出'),
                    ),
                  ],
                ),
              ],
            ),
    );
  }

  String _shortDate(DateTime date) {
    final local = date.toLocal();
    return '${local.month}/${local.day}';
  }
}
