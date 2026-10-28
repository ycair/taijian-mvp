import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'public_journal_models.dart';

class PublicJournalPhotoImage extends StatelessWidget {
  const PublicJournalPhotoImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.icon = Icons.photo_outlined,
  });

  final String? url;
  final BoxFit fit;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final value = url;
    if (value == null || value.isEmpty) return _Placeholder(icon: icon);
    return Image.network(
      value,
      fit: fit,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : const ColoredBox(color: AppTokens.successBg),
      errorBuilder: (context, error, stackTrace) => _Placeholder(icon: icon),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTokens.successBg, AppTokens.butter],
        ),
      ),
      child: Center(child: Icon(icon, size: 38, color: AppTokens.primaryStrong)),
    );
  }
}

class PublicJournalAuthorAvatar extends StatelessWidget {
  const PublicJournalAuthorAvatar({
    super.key,
    required this.name,
    this.avatarUrl,
    this.radius = 16,
  });

  final String name;
  final String? avatarUrl;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final avatar = avatarUrl;
    return CircleAvatar(
      radius: radius,
      backgroundColor: AppTokens.successBg,
      foregroundImage: avatar == null || avatar.isEmpty ? null : NetworkImage(avatar),
      onForegroundImageError: avatar == null || avatar.isEmpty ? null : (_, _) {},
      child: Text(
        name.trim().isEmpty ? '苔' : name.trim().substring(0, 1),
        style: TextStyle(
          fontSize: radius * 0.8,
          fontWeight: FontWeight.w800,
          color: AppTokens.primaryStrong,
        ),
      ),
    );
  }
}

class PublicJournalEntryCard extends StatelessWidget {
  const PublicJournalEntryCard({
    super.key,
    required this.entry,
    required this.isSelf,
    required this.onOpen,
    required this.onLike,
    required this.onFollow,
    required this.onBlock,
    required this.onReport,
  });

  final PublicJournalEntry entry;
  final bool isSelf;
  final VoidCallback onOpen;
  final VoidCallback onLike;
  final VoidCallback onFollow;
  final VoidCallback onBlock;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: MossCard(
        padding: EdgeInsets.zero,
        onTap: onOpen,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTokens.radiusLg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 16 / 9,
                child: PublicJournalPhotoImage(url: entry.coverUrl),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        PublicJournalAuthorAvatar(
                          name: entry.authorName,
                          avatarUrl: entry.authorAvatar,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            entry.authorName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                          ),
                        ),
                        Text(entry.dateLabel, style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                    const SizedBox(height: 9),
                    Text(entry.title, style: Theme.of(context).textTheme.titleMedium),
                    if (entry.body.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        entry.body,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    if (entry.residents.isNotEmpty) ...[
                      const SizedBox(height: 9),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final resident in entry.residents)
                            _ResidentChip(resident: resident),
                        ],
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _Action(
                          icon: entry.liked ? Icons.favorite : Icons.favorite_border,
                          label: '${entry.likeCount}',
                          color: entry.liked ? AppTokens.overdue : AppTokens.muted,
                          onTap: onLike,
                          tooltip: entry.liked ? '取消讚' : '點讚',
                        ),
                        _Action(
                          icon: Icons.chat_bubble_outline,
                          label: '${entry.commentCount}',
                          color: AppTokens.muted,
                          onTap: onOpen,
                          tooltip: '查看留言',
                        ),
                        if (!isSelf)
                          _Action(
                            icon: entry.following ? Icons.person_remove_outlined : Icons.person_add_alt_1,
                            label: entry.following ? '已追蹤' : '追蹤',
                            color: entry.following ? AppTokens.primaryStrong : AppTokens.muted,
                            onTap: onFollow,
                            tooltip: entry.following ? '取消追蹤作者' : '追蹤作者',
                          ),
                        const Spacer(),
                        if (!isSelf)
                          PopupMenuButton<String>(
                            tooltip: '旅程選項',
                            onSelected: (value) {
                              if (value == 'report') onReport();
                              if (value == 'block') onBlock();
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
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ResidentChip extends StatelessWidget {
  const _ResidentChip({required this.resident});

  final PublicJournalResident resident;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: AppTokens.successBg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '${resident.name} · ${resident.speciesLabel ?? '居民'}',
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppTokens.primaryStrong,
        ),
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    required this.tooltip,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 19, color: color),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
