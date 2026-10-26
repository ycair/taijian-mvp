import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/features/animals/animal_detail_screen.dart';
import 'package:mobile/features/animals/animals_screen.dart';
import 'package:mobile/features/today/today_screen.dart';
import '../support/test_harness.dart';

Future<void> _finish(WidgetTester tester, TestHarness harness) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
  final closing = harness.dispose();
  await tester.pump();
  await closing;
}

void main() {
  setUpAll(initializeTimeZones);

  testWidgets('Today lists seeded tasks and marks the completed one', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(wrapScreen(harness, const TodayScreen()));
    await tester.pumpAndSettle();

    expect(find.textContaining('小苔'), findsOneWidget);
    expect(find.text('阿肥 · 餵食'), findsOneWidget);
    expect(find.text('小綠 · 換水'), findsOneWidget);
    expect(find.text('慢慢 · 巡視環境'), findsOneWidget);
    expect(find.textContaining('已完成 · 阿川'), findsOneWidget);
    expect(find.text('待完成 2'), findsOneWidget);

    await _finish(tester, harness);
  });

  testWidgets('Today completes a task through the outbox', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(wrapScreen(harness, const TodayScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('阿肥 · 餵食'));
    await tester.pumpAndSettle();

    expect(find.textContaining('已完成'), findsWidgets);
    expect(
      harness.store.completions.values.any(
        (completion) => completion.reminderId == 'rem_afa_feed' && completion.completedByName == '小苔',
      ),
      isTrue,
    );
    expect(await harness.dependencies.outbox.pendingEntries(), isEmpty);

    await _finish(tester, harness);
  });

  testWidgets('Animal detail exposes edit and owner-only admin actions', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(
      wrapScreen(harness, const AnimalDetailScreen(animalId: 'animal_afa')),
    );
    await tester.pumpAndSettle();

    expect(find.text('阿肥'), findsWidgets);
    await tester.tap(find.byTooltip('編輯居民'));
    await tester.pumpAndSettle();
    expect(find.text('編輯居民'), findsOneWidget);
    expect(find.text('儲存變更'), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('居民管理'));
    await tester.pumpAndSettle();
    expect(find.text('封存居民'), findsOneWidget);
    expect(find.text('刪除居民'), findsOneWidget);

    await _finish(tester, harness);
  });

  testWidgets('Memorial residents are separated and read-only', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);
    final slow = harness.store.animals['animal_slow']!;
    harness.store.animals['animal_slow'] = slow.copyWith(
      status: 'memorial',
      memorialAt: DateTime.utc(2026, 10, 20),
      memorialNote: '謝謝慢慢。',
    );

    await tester.pumpWidget(wrapScreen(harness, const AnimalsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('紀念'), findsOneWidget);
    expect(find.textContaining('慢慢'), findsOneWidget);

    await tester.pumpWidget(
      wrapScreen(harness, const AnimalDetailScreen(animalId: 'animal_slow')),
    );
    await tester.pumpAndSettle();
    expect(find.text('已成為了苔間的回憶。', findRichText: true), findsOneWidget);
    expect(find.text('謝謝慢慢。'), findsOneWidget);
    expect(find.byTooltip('編輯居民'), findsNothing);
    expect(find.byTooltip('居民管理'), findsNothing);

    await _finish(tester, harness);
  });

  testWidgets('Animals shows every seeded resident', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(wrapScreen(harness, const AnimalsScreen()));
    await tester.pumpAndSettle();

    expect(find.text('阿肥'), findsOneWidget);
    expect(find.text('小綠'), findsOneWidget);
    expect(find.text('慢慢'), findsOneWidget);
    expect(find.textContaining('3 位居民'), findsOneWidget);
    expect(find.text('豹紋守宮 · Hypo'), findsOneWidget);

    await _finish(tester, harness);
  });
}
