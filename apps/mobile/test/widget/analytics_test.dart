import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/features/records/household_analytics_screen.dart';
import 'package:mobile/features/records/measurement_chart.dart';
import 'package:mobile/features/records/record_date_range.dart';
import '../support/test_harness.dart';

void main() {
  test('date range converts local days to UTC boundaries', () {
    final range = RecordDateRange.lastDays(7);
    final from = range.startUtc('Asia/Taipei');
    final to = range.endExclusiveUtc('Asia/Taipei');
    expect(to.isAfter(from), isTrue);
    expect(to.difference(from).inDays, 7);
  });

  testWidgets('measurement chart renders points', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MeasurementChart(
            points: [
              RecordMeasurementPoint(
                type: RecordType.weight,
                label: '體重',
                unit: 'g',
                date: '2026-10-01',
                value: 60,
                occurredAt: DateTime.utc(2026, 10, 1),
              ),
              RecordMeasurementPoint(
                type: RecordType.weight,
                label: '體重',
                unit: 'g',
                date: '2026-10-02',
                value: 62,
                occurredAt: DateTime.utc(2026, 10, 2),
              ),
            ],
            unit: 'g',
          ),
        ),
      ),
    );
    expect(find.byType(MeasurementChart), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('household analytics renders the seeded care summary', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(wrapScreen(harness, const HouseholdAnalyticsScreen()));
    await tester.pumpAndSettle();

    expect(find.text('家庭照護分析'), findsOneWidget);
    expect(find.text('總紀錄'), findsOneWidget);
    expect(find.text('照護頻率'), findsOneWidget);
    expect(find.text('最近紀錄'), findsOneWidget);
  });
}
