import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'proposals_repository.dart';

class ProposalsScreen extends ConsumerStatefulWidget {
  const ProposalsScreen({super.key});

  @override
  ConsumerState<ProposalsScreen> createState() => _ProposalsScreenState();
}

class _ProposalsScreenState extends ConsumerState<ProposalsScreen> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final proposals = ref.watch(proposalsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('提案與附議'),
        actions: [
          IconButton(
            tooltip: '新增提案',
            onPressed: () => _create(context),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppTokens.primary,
        onRefresh: () async => ref.invalidate(proposalsProvider),
        child: proposals.when(
          loading: () => const LoadingView(),
          error: (error, stack) => ListView(
            children: [
              ErrorView(
                message: '讀取提案失敗，請稍後再試。',
                onRetry: () => ref.invalidate(proposalsProvider),
              ),
            ],
          ),
          data: (items) => items.isEmpty
              ? ListView(
                  padding: const EdgeInsets.only(top: 36),
                  children: [
                    EmptyState(
                      title: '還沒有提案',
                      body: '想讓苔間變得更好？寫下第一個提案，讓家人附議。',
                      action: FilledButton(
                        onPressed: () => _create(context),
                        child: const Text('提出提案'),
                      ),
                    ),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
                  children: [
                    Text(
                      '提案會公開顯示你的家庭顯示名稱；一人一票，可隨時取消附議。',
                      style: TextStyle(color: AppTokens.muted, fontSize: 13, height: 1.5),
                    ),
                    const SizedBox(height: 12),
                    for (final proposal in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _ProposalCard(
                          proposal: proposal,
                          busy: _busy,
                          onVote: () => _vote(proposal),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }

  Future<void> _vote(Proposal proposal) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(proposalsRepositoryProvider).vote(proposal);
      ref.invalidate(proposalsProvider);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('附議失敗：$error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _create(BuildContext context) async {
    final title = TextEditingController();
    final body = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('提出提案'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: title,
                maxLength: 80,
                decoration: const InputDecoration(labelText: '一句話說明', hintText: '例如：希望有更多圖表'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: body,
                maxLines: 5,
                maxLength: 5000,
                decoration: const InputDecoration(labelText: '補充說明（選填）', alignLabelWithHint: true),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(title.text.trim().isNotEmpty),
            child: const Text('送出'),
          ),
        ],
      ),
    );
    if (submitted != true) {
      title.dispose();
      body.dispose();
      return;
    }
    try {
      await ref.read(proposalsRepositoryProvider).create(title: title.text, body: body.text);
      ref.invalidate(proposalsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('提案已建立。')));
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('建立提案失敗：$error')));
      }
    } finally {
      title.dispose();
      body.dispose();
    }
  }
}

class _ProposalCard extends StatelessWidget {
  const _ProposalCard({required this.proposal, required this.busy, required this.onVote});

  final Proposal proposal;
  final bool busy;
  final VoidCallback onVote;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(proposal.title, style: Theme.of(context).textTheme.titleMedium),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: proposal.status == 'open' ? AppTokens.successBg : AppTokens.butter,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  proposal.statusLabel,
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppTokens.primaryStrong),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text('${proposal.authorName} · ${proposal.createdAt.toLocal().toString().substring(0, 10)}', style: Theme.of(context).textTheme.bodySmall),
          if (proposal.body.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(proposal.body, style: const TextStyle(height: 1.55)),
          ],
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: busy ? null : onVote,
              icon: Icon(proposal.voted ? Icons.how_to_vote : Icons.how_to_vote_outlined, size: 18),
              label: Text('${proposal.voted ? '已附議' : '附議'} ${proposal.voteCount}'),
            ),
          ),
        ],
      ),
    );
  }
}
