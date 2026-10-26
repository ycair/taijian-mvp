import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'record_action_tile.dart';
import 'record_analytics_repository.dart';
import 'record_date_range.dart';

class HouseholdAnalyticsScreen extends ConsumerStatefulWidget {
  const HouseholdAnalyticsScreen({super.key});

  @override
  ConsumerState<HouseholdAnalyticsScreen> createState() => _HouseholdAnalyticsScreenState();
}

class _HouseholdAnalyticsScreenState extends ConsumerState<HouseholdAnalyticsScreen> {
  RecordDateRange _range = RecordDateRange.lastDays(30);

  @override
  Widget build(BuildContext context) {
    final timezone = ref.watch(householdTimezoneProvider);
    final animals = ref.watch(animalsProvider).value ?? const <Animal>[];
    final byId = {for (final animal in animals) animal.id: animal};
    final request = RecordAnalyticsRequest(
      animalId: null,
      from: _range.startUtc(timezone),
      to: _range.endExclusiveUtc(timezone),
    );
    final analytics = ref.watch(recordAnalyticsProvider(request));

    return Scaffold(
      appBar: AppBar(title: const Text('家庭照護分析')),
      body: RefreshIndicator(
        color: AppTokens.primary,
        onRefresh: () async {
          ref.invalidate(recordAnalyticsProvider);
          ref.invalidate(recordsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 36),
          children: [
            RecordDateRangeBar(
              range: _range,
              onChanged: (range) => setState(() => _range = range),
            ),
            if (analytics.hasError)
              ErrorView(
                message: '讀取分析失敗，請稍後再試。',
                onRetry: () => ref.invalidate(recordAnalyticsProvider),
              )
            else if (analytics.isLoading)
              const LoadingView()
            else
              _AnalyticsBody(
                analytics: analytics.value ?? const RecordAnalytics(),
                range: _range,
                timezone: timezone,
                animals: byId,
              ),
          ],
        ),
      ),
    );
  }
}

class _AnalyticsBody extends StatelessWidget {
  const _AnalyticsBody({
    required this.analytics,
    required this.range,
    required this.timezone,
    required this.animals,
  });

  final RecordAnalytics analytics;
  final RecordDateRange range;
  final String timezone;
  final Map<String, Animal> animals;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: _MetricCard(
                  label: '總紀錄',
                  value: '${analytics.total}',
                  hint: range.label,
                  color: AppTokens.primary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MetricCard(
                  label: '有紀錄的日子',
                  value: '${analytics.activeDays}',
                  hint: '天',
                  color: AppTokens.accent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          const _SectionTitle(title: '照護頻率'),
          const SizedBox(height: 10),
          MossCard(
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final type in const [
                  RecordType.feeding,
                  RecordType.water,
                  RecordType.weight,
                  RecordType.length,
                  RecordType.poop,
                  RecordType.shed,
                  RecordType.activity,
                  RecordType.medical,
                ])
                  _CountChip(type: type, count: analytics.countFor(type)),
              ],
            ),
          ),
          if (analytics.hasAttention) ...[
            const SizedBox(height: 22),
            const _SectionTitle(title: '需要留意'),
            const SizedBox(height: 10),
            MossCard(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              child: Column(
                children: [
                  if (analytics.refusedFeedings > 0)
                    _AttentionRow(
                      icon: Icons.no_food_outlined,
                      label: '拒食',
                      count: analytics.refusedFeedings,
                    ),
                  if (analytics.abnormalActivity > 0)
                    _AttentionRow(
                      icon: Icons.directions_run,
                      label: '活動力異常',
                      count: analytics.abnormalActivity,
                    ),
                  if (analytics.medicalCount > 0)
                    _AttentionRow(
                      icon: Icons.medical_services_outlined,
                      label: '醫療紀錄',
                      count: analytics.medicalCount,
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 22),
          const _SectionTitle(title: '最近紀錄'),
          const SizedBox(height: 8),
          if (analytics.recent.isEmpty)
            MossCard(
              child: Text('這段期間還沒有紀錄。', style: Theme.of(context).textTheme.bodySmall),
            )
          else
            MossCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  for (final record in analytics.recent.take(10))
                    RecordActionTile(
                      record: record,
                      animal: animals[record.animalId],
                      timezone: timezone,
                      showAnimal: true,
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.hint,
    required this.color,
  });

  final String label;
  final String value;
  final String hint;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 8),
          Text(value, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
          Text(hint, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({required this.type, required this.count});

  final RecordType type;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: count > 0 ? AppTokens.successBg : const Color(0xFFF8F3EB),
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(iconForRecord(type), size: 16, color: AppTokens.primaryStrong),
          const SizedBox(width: 6),
          Text(
            '${type.label} $count',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: count > 0 ? AppTokens.primaryStrong : AppTokens.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({required this.icon, required this.label, required this.count});

  final IconData icon;
  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppTokens.overdue),
          const SizedBox(width: 8),
          Expanded(child: Text(label)),
          Text(
            '$count 次',
            style: const TextStyle(fontWeight: FontWeight.w800, color: AppTokens.overdue),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(title, style: Theme.of(context).textTheme.titleMedium);
  }
}
