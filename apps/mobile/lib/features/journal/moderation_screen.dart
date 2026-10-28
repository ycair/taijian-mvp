import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/command_result.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'public_journal_models.dart';
import 'public_journal_repository.dart';

class ModerationScreen extends ConsumerStatefulWidget {
  const ModerationScreen({super.key});

  @override
  ConsumerState<ModerationScreen> createState() => _ModerationScreenState();
}

class _ModerationScreenState extends ConsumerState<ModerationScreen> {
  String _status = 'open';
  List<ModerationReport>? _reports;
  String? _error;
  bool _loading = true;
  String? _busyId;

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
      final reports = await ref.read(publicJournalRepositoryProvider).fetchReports(status: _status);
      if (!mounted) return;
      setState(() {
        _reports = reports;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error is PublicJournalException && error.code == 'FORBIDDEN'
            ? '這個帳號沒有管理權限。'
            : (error is PublicJournalException ? error.message : '讀取檢舉失敗，請稍後再試。');
        _loading = false;
      });
    }
  }

  Future<void> _loadStatus(String status) async {
    setState(() => _status = status);
    await _load();
  }

  Future<void> _resolve(ModerationReport report, String status) async {
    if (_busyId != null) return;
    setState(() => _busyId = report.id);
    try {
      final result = await ref
          .read(publicJournalRepositoryProvider)
          .resolveReport(report.id, status);
      if (!mounted) return;
      if (!result.ok) {
        _toast(commandErrorMessage(result));
        return;
      }
      setState(() {
        _reports = [
          for (final item in _reports ?? const <ModerationReport>[])
            if (item.id != report.id) item,
        ];
      });
      _toast(status == 'reviewed' ? '已標記為處理完成。' : '已忽略這筆檢舉。');
    } catch (error) {
      if (mounted) {
        _toast(error is PublicJournalException ? error.message : '更新檢舉失敗，請稍後再試。');
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _openEntry(ModerationReport report) async {
    final token = report.shareToken;
    if (token == null || token.isEmpty) return;
    await context.push('/journal/public/$token');
    if (mounted) await _load(showLoading: false);
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final reports = _reports ?? const <ModerationReport>[];
    return Scaffold(
      appBar: AppBar(title: const Text('檢舉管理')),
      body: RefreshIndicator(
        color: AppTokens.primary,
        onRefresh: () => _load(showLoading: false),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
          children: [
            Text(
              '只有管理員能查看與處理公開旅程檢舉。',
              style: TextStyle(color: AppTokens.muted, height: 1.5),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final item in const [
                  ('open', '待處理'),
                  ('reviewed', '已處理'),
                  ('dismissed', '已忽略'),
                ])
                  ChoiceChip(
                    label: Text(item.$2),
                    selected: _status == item.$1,
                    onSelected: (_) => _loadStatus(item.$1),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            if (_error != null)
              InlineBanner(
                icon: Icons.shield_outlined,
                message: _error!,
                color: AppTokens.butter,
                trailing: TextButton(onPressed: _load, child: const Text('重試')),
              ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: LoadingView(label: '載入檢舉中…'),
              )
            else if (_error == null && reports.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: EmptyState(title: '目前沒有檢舉', body: '這個狀態下沒有需要處理的內容。'),
              )
            else
              for (final report in reports)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _ReportCard(
                    report: report,
                    busy: _busyId == report.id,
                    onOpen: () => _openEntry(report),
                    onReviewed: () => _resolve(report, 'reviewed'),
                    onDismissed: () => _resolve(report, 'dismissed'),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({
    required this.report,
    required this.busy,
    required this.onOpen,
    required this.onReviewed,
    required this.onDismissed,
  });

  final ModerationReport report;
  final bool busy;
  final VoidCallback onOpen;
  final VoidCallback onReviewed;
  final VoidCallback onDismissed;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(report.displayTitle, style: Theme.of(context).textTheme.titleMedium),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: report.status == 'open' ? AppTokens.butter : AppTokens.successBg,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  report.statusLabel,
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            '${_formatDate(report.createdAt)} · 檢舉人 ${report.reporterName}'
            '${report.targetAuthorName == null ? '' : ' · 作者 ${report.targetAuthorName}'}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (report.commentBody != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTokens.successBg,
                borderRadius: BorderRadius.circular(AppTokens.radiusSm),
              ),
              child: Text(
                '留言：${report.commentBody}',
                style: const TextStyle(height: 1.5),
              ),
            ),
          ],
          const SizedBox(height: 10),
          Text(report.reason, style: const TextStyle(height: 1.5)),
          if (report.shareToken != null || report.status == 'open') ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (report.shareToken != null)
                  OutlinedButton(
                    onPressed: onOpen,
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                    child: const Text('查看旅程'),
                  ),
                if (report.status == 'open') ...[
                  FilledButton(
                    onPressed: busy ? null : onReviewed,
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                    child: const Text('標記已處理'),
                  ),
                  OutlinedButton(
                    onPressed: busy ? null : onDismissed,
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                    child: const Text('忽略'),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    final local = date.toLocal();
    return '${local.year}/${local.month.toString().padLeft(2, '0')}/${local.day.toString().padLeft(2, '0')} '
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}
