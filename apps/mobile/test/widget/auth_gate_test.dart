import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/providers.dart';
import 'package:mobile/app/router.dart';
import 'package:mobile/core/time/app_time.dart';
import '../support/test_harness.dart';

void main() {
  setUpAll(initializeTimeZones);

  testWidgets('auth gate: sign in reaches the shell, sign out returns to sign-in', (
    tester,
  ) async {
    final harness = await createTestHarness(startSignedIn: false);
    addTearDown(harness.dispose);

    await tester.pumpWidget(wrapApp(harness));
    await tester.pumpAndSettle();

    expect(find.text('使用測試帳號登入'), findsOneWidget);
    expect(find.text('今日'), findsNothing);

    await tester.tap(find.text('使用測試帳號登入'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();

    expect(find.text('今日'), findsWidgets);
    expect(find.text('使用測試帳號登入'), findsNothing);

    await tester.tap(find.byIcon(Icons.settings_outlined));
    await tester.pumpAndSettle();
    await tester.dragUntilVisible(
      find.text('登出'),
      find.byType(ListView).last,
      const Offset(0, -300),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('登出'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, '登出'));
    await tester.pumpAndSettle();

    expect(find.text('使用測試帳號登入'), findsOneWidget);
    expect(harness.auth.currentUser, isNull);

    // Dispose the periodic OutboxAutoSync timer and let drift's zero-delay
    // stream-close timers run before the test invariant check.
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    // drift's close waits for its own zero-delay timers, which only run while
    // the fake-async test clock is pumped.
    final closing = harness.dispose();
    await tester.pump();
    await closing;
  });

  test('the router instance is stable across auth emissions', () async {
    final harness = await createTestHarness(startSignedIn: false);
    final container = ProviderContainer(
      overrides: [appDependenciesProvider.overrideWithValue(harness.dependencies)],
    );
    addTearDown(() {
      container.dispose();
      harness.dispose();
    });

    final first = container.read(routerProvider);
    await harness.auth.signInWithApple();
    await Future<void>.delayed(const Duration(milliseconds: 300));

    expect(identical(container.read(routerProvider), first), isTrue);

    await harness.auth.signOut();
    await Future<void>.delayed(const Duration(milliseconds: 200));
    expect(identical(container.read(routerProvider), first), isTrue);
  });
}
