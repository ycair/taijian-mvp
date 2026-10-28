import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'public_resident_models.dart';
import 'public_resident_repository.dart';

class PublicResidentScreen extends ConsumerStatefulWidget {
  const PublicResidentScreen({super.key, required this.token});

  final String token;

  @override
  ConsumerState<PublicResidentScreen> createState() => _PublicResidentScreenState();
}

class _PublicResidentScreenState extends ConsumerState<PublicResidentScreen> {
  PublicResident? _resident;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final resident = await ref.read(publicResidentRepositoryProvider).fetch(widget.token);
      if (!mounted) return;
      setState(() {
        _resident = resident;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error is PublicResidentException ? error.message : '讀取公開居民失敗，請稍後再試。';
        _loading = false;
      });
    }
  }

  Future<void> _share() async {
    final resident = _resident;
    if (resident == null) return;
    final url = resident.publicUrl(widget.token);
    try {
      await SharePlus.instance.share(
        ShareParams(
          text: [
            '苔間 · ${resident.profile.name} 的公開照護紀錄',
            resident.profile.speciesLabel,
            '',
            url,
          ].join('\n'),
          subject: '${resident.profile.name} 的公開照護紀錄',
        ),
      );
    } catch (_) {
      // The system share sheet can be unavailable on simulators.
    }
  }

  @override
  Widget build(BuildContext context) {
    final resident = _resident;
    return Scaffold(
      appBar: AppBar(
        title: const Text('公開居民'),
        actions: [
          if (resident != null)
            IconButton(
              tooltip: '分享公開記錄',
              onPressed: _share,
              icon: const Icon(Icons.ios_share),
            ),
        ],
      ),
      body: _loading && resident == null
          ? const LoadingView(label: '載入公開居民…')
          : _error != null && resident == null
          ? ErrorView(message: _error!, onRetry: _load)
          : resident == null
          ? const EmptyState(title: '找不到居民', body: '這位居民可能已關閉公開紀錄。')
          : RefreshIndicator(
              color: AppTokens.primary,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
                children: [
                  _ProfileCard(profile: resident.profile),
                  const SizedBox(height: 12),
                  Text(
                    '這是屋主主動公開的照護紀錄，任何人都可以透過連結唯讀查看。',
                    style: TextStyle(color: AppTokens.muted, height: 1.5),
                  ),
                  if (resident.parents.isNotEmpty || resident.children.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    _RelativesSection(
                      title: '父母',
                      relatives: resident.parents,
                      onOpen: (token) => context.push('/resident/public/$token'),
                    ),
                    const SizedBox(height: 10),
                    _RelativesSection(
                      title: '子代',
                      relatives: resident.children,
                      onOpen: (token) => context.push('/resident/public/$token'),
                    ),
                  ],
                  const SizedBox(height: 18),
                  Text(
                    '照護紀錄 · ${resident.records.length}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  if (resident.records.isEmpty)
                    Text('目前沒有公開的照護紀錄。', style: Theme.of(context).textTheme.bodySmall)
                  else
                    for (final record in resident.records)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _RecordCard(record: record),
                      ),
                ],
              ),
            ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.profile});

  final PublicResidentProfile profile;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AnimalAvatar(
                label: profile.name,
                colorHex: profile.avatarColor,
                pattern: profile.avatarPattern,
                size: 64,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(profile.name, style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    Text(
                      [profile.speciesLabel, profile.morph, profile.sexLabel]
                          .whereType<String>()
                          .where((value) => value.isNotEmpty)
                          .join(' · '),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTokens.successBg,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  profile.statusLabel,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppTokens.primaryStrong,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RecordCard extends StatelessWidget {
  const _RecordCard({required this.record});

  final PublicResidentRecord record;

  @override
  Widget build(BuildContext context) {
    final detail = record.detail;
    return MossCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: AppTokens.successBg, shape: BoxShape.circle),
            child: Icon(_icon, size: 19, color: AppTokens.primaryStrong),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        record.label,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    Text(_date(record.occurredAt), style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
                if (record.food != null) ...[
                  const SizedBox(height: 3),
                  Text('食物：${record.food}', style: Theme.of(context).textTheme.bodySmall),
                ],
                if (detail != null) ...[
                  const SizedBox(height: 3),
                  Text(detail, style: const TextStyle(height: 1.5)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData get _icon => switch (record.type) {
    'feeding' => Icons.restaurant_outlined,
    'water' => Icons.water_drop_outlined,
    'weight' => Icons.monitor_weight_outlined,
    'length' => Icons.straighten,
    'poop' => Icons.eco_outlined,
    'shed' => Icons.auto_awesome_outlined,
    'activity' => Icons.directions_run,
    'medical' => Icons.medical_services_outlined,
    _ => Icons.edit_note_outlined,
  };

  String _date(DateTime date) {
    final local = date.toLocal();
    return '${local.year}/${local.month.toString().padLeft(2, '0')}/${local.day.toString().padLeft(2, '0')}';
  }
}

class _RelativesSection extends StatelessWidget {
  const _RelativesSection({
    required this.title,
    required this.relatives,
    required this.onOpen,
  });

  final String title;
  final List<PublicResidentRelative> relatives;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        if (relatives.isEmpty)
          Text('沒有公開的$title。', style: Theme.of(context).textTheme.bodySmall)
        else
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final relative in relatives)
                relative.canOpen
                    ? ActionChip(
                        avatar: CircleAvatar(
                          backgroundColor: AppTokens.colorFromHex(relative.avatarColor ?? '#7C9A76'),
                          child: Text(
                            (relative.name ?? '?').substring(0, 1),
                            style: const TextStyle(fontSize: 10),
                          ),
                        ),
                        label: Text('${relative.name} · ${relative.speciesLabel ?? '居民'}'),
                        onPressed: () => onOpen(relative.token!),
                      )
                    : const Chip(label: Text('已隱藏')),
            ],
          ),
      ],
    );
  }
}
