import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/providers.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/data/outbox/outbox_database.dart';
import 'package:mobile/features/today/today_screen.dart';
import '../support/test_harness.dart';

void main() {
  setUpAll(initializeTimeZones);

  testWidgets('an offline completion is queued as a pending task.complete', (tester) async {
    final harness = await createTestHarness(apiBuilder: (_) => OfflineCommandApi());
    addTearDown(harness.dispose);

    await tester.pumpWidget(wrapScreen(harness, const TodayScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('阿肥 · 餵食'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();

    final rows = await harness.database.select(harness.database.outboxEntries).get();
    expect(rows, hasLength(1));
    expect(rows.single.type, 'task.complete');
    expect(rows.single.status, OutboxStatus.pending);

    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    final closing = harness.dispose();
    await tester.pump();
    await closing;
  });

  testWidgets('a pending completion renders as 同步中', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);
    final todayKey = localDateKey(DateTime.now(), 'Asia/Taipei');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDependenciesProvider.overrideWithValue(harness.dependencies),
          outboxEntriesProvider.overrideWith((ref) => Stream.value(const <OutboxEntry>[])),
          conflictsProvider.overrideWith((ref) => Stream.value(const <OutboxEntry>[])),
          pendingTaskCompletionKeysProvider.overrideWithValue({'rem_afa_feed:$todayKey'}),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const Scaffold(body: TodayScreen()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('同步中'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    final closing = harness.dispose();
    await tester.pump();
    await closing;
  });
}
