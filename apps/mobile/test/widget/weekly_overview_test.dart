import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/features/reminders/weekly_overview_screen.dart';
import '../support/test_harness.dart';

void main() {
  setUpAll(initializeTimeZones);

  testWidgets('weekly overview renders seven local days and reminders', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(wrapScreen(harness, const WeeklyOverviewScreen()));
    await tester.pumpAndSettle();

    expect(find.text('本週提醒'), findsOneWidget);
    expect(find.text('接下來 7 天的照護排程。'), findsOneWidget);
    expect(find.textContaining('阿肥'), findsWidgets);
  });
}
