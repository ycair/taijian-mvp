import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'measurement_chart.dart';
import 'record_action_tile.dart';
import 'record_analytics_repository.dart';
import 'record_date_range.dart';

class AnimalAnalyticsScreen extends ConsumerStatefulWidget {
  const AnimalAnalyticsScreen({super.key, required this.animalId});

  final String animalId;

  @override
  ConsumerState<AnimalAnalyticsScreen> createState() => _AnimalAnalyticsScreenState();
}

class _AnimalAnalyticsScreenState extends ConsumerState<AnimalAnalyticsScreen> {
  RecordDateRange _range = RecordDateRange.lastDays(30);
  String? _measurementKey;

  @override
  Widget build(BuildContext context) {
    final animal = ref.watch(animalProvider(widget.animalId)).value;
    final timezone = ref.watch(householdTimezoneProvider);
    final request = RecordAnalyticsRequest(
      animalId: widget.animalId,
      from: _range.startUtc(timezone),
      to: _range.endExclusiveUtc(timezone),
    );
    final analytics = ref.watch(recordAnalyticsProvider(request));

    return Scaffold(
      appBar: AppBar(title: Text(animal == null ? '居民分析' : '${animal.name} · 分析')),
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
              _AnimalAnalyticsBody(
                animal: animal,
                analytics: analytics.value ?? const RecordAnalytics(),
                range: _range,
                timezone: timezone,
                selectedMeasurementKey: _measurementKey,
                onMeasurementChanged: (key) => setState(() => _measurementKey = key),
              ),
          ],
        ),
      ),
    );
  }
}

class _AnimalAnalyticsBody extends StatelessWidget {
  const _AnimalAnalyticsBody({
    required this.animal,
    required this.analytics,
    required this.range,
    required this.timezone,
    required this.selectedMeasurementKey,
    required this.onMeasurementChanged,
  });

  final Animal? animal;
  final RecordAnalytics analytics;
  final RecordDateRange range;
  final String timezone;
  final String? selectedMeasurementKey;
  final ValueChanged<String?> onMeasurementChanged;

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<RecordMeasurementPoint>>{};
    for (final point in analytics.measurements) {
      final key = '${point.type.name}:${point.label}';
      groups.putIfAbsent(key, () => []).add(point);
    }
    final selectedKey = selectedMeasurementKey != null && groups.containsKey(selectedMeasurementKey)
        ? selectedMeasurementKey!
        : groups.keys.firstOrNull;
    final selectedPoints = selectedKey == null ? const <RecordMeasurementPoint>[] : groups[selectedKey]!;
    final selectedUnit = selectedPoints.isEmpty ? '' : selectedPoints.last.unit;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (animal != null)
            MossCard(
              child: Row(
                children: [
                  AnimalAvatar(
                    label: animal!.initial,
                    colorHex: animal!.avatarColor,
                    pattern: animal!.avatarPattern,
                    size: 52,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(animal!.name, style: Theme.of(context).textTheme.titleMedium),
                        Text(
                          '${range.label} · ${analytics.total} 筆紀錄 · ${analytics.activeDays} 天有紀錄',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 20),
          const _SectionTitle(title: '量測趨勢'),
          const SizedBox(height: 10),
          MossCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (groups.isEmpty)
                  Text('這段期間還沒有體重、身長或自訂測量。', style: Theme.of(context).textTheme.bodySmall)
                else ...[
                  if (groups.length > 1)
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final entry in groups.entries) ...[
                            ChoiceChip(
                              label: Text(entry.value.first.label),
                              selected: selectedKey == entry.key,
                              onSelected: (_) => onMeasurementChanged(entry.key),
                            ),
                            const SizedBox(width: 6),
                          ],
                        ],
                      ),
                    ),
                  if (groups.length > 1) const SizedBox(height: 10),
                  MeasurementChart(points: selectedPoints, unit: selectedUnit),
                ],
              ],
            ),
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
              child: Column(
                children: [
                  if (analytics.refusedFeedings > 0)
                    _AttentionRow(label: '拒食', count: analytics.refusedFeedings),
                  if (analytics.abnormalActivity > 0)
                    _AttentionRow(label: '活動力異常', count: analytics.abnormalActivity),
                  if (analytics.medicalCount > 0)
                    _AttentionRow(label: '醫療紀錄', count: analytics.medicalCount),
                  if (analytics.weightChange != null && analytics.weightChange!.abs() > 0)
                    _WeightChangeRow(
                      label: '體重變化',
                      value: '${analytics.weightChange! >= 0 ? '+' : ''}'
                          '${analytics.weightChange!.toStringAsFixed(1)} ${analytics.weightUnit}',
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 22),
          const _SectionTitle(title: '這段期間的紀錄'),
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
                  for (final record in analytics.recent)
                    RecordActionTile(
                      record: record,
                      animal: animal,
                      timezone: timezone,
                    ),
                ],
              ),
            ),
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

class _WeightChangeRow extends StatelessWidget {
  const _WeightChangeRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          const Icon(Icons.monitor_weight_outlined, size: 18, color: AppTokens.overdue),
          const SizedBox(width: 8),
          Expanded(child: Text(label)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800, color: AppTokens.overdue)),
        ],
      ),
    );
  }
}

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          const Icon(Icons.priority_high, size: 18, color: AppTokens.overdue),
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
