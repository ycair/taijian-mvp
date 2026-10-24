import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/bootstrap.dart';
import 'package:mobile/app/providers.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/data/mock/mock_auth_service.dart';
import 'package:mobile/data/mock/mock_command_api.dart';
import 'package:mobile/data/mock/mock_store.dart';
import 'package:mobile/data/outbox/outbox.dart';
import 'package:mobile/data/outbox/outbox_database.dart';
import 'package:mobile/data/read/mock_read_store.dart';
import 'package:mobile/features/animals/animals_screen.dart';
import 'package:mobile/features/today/today_screen.dart';

class _Harness {
  _Harness({
    required this.store,
    required this.auth,
    required this.database,
    required this.dependencies,
  });

  final MockStore store;
  final MockAuthService auth;
  final OutboxDatabase database;
  final AppDependencies dependencies;

  void dispose() {
    database.close();
    store.dispose();
    auth.dispose();
  }
}

Future<_Harness> _createHarness() async {
  final store = MockStore.seeded();
  final auth = MockAuthService(store: store);
  final database = OutboxDatabase.withExecutor(NativeDatabase.memory());
  final api = MockCommandApi(
    store: store,
    uid: () => auth.currentUser?.uid ?? '',
    latency: Duration.zero,
  );
  final outbox = Outbox(db: database, api: api, uid: () => auth.currentUser?.uid ?? '');
  final dependencies = AppDependencies(
    config: const AppConfig(
      useMock: true,
      liffUrl: 'https://liff.line.me/0000000000-taijian',
      appCheckDebugToken: '',
      enableAppCheck: false,
      mockStartSignedIn: true,
    ),
    auth: auth,
    readStore: MockReadStore(store),
    commandApi: api,
    outbox: outbox,
    outboxDatabase: database,
  );
  return _Harness(store: store, auth: auth, database: database, dependencies: dependencies);
}

Widget _wrap(_Harness harness, Widget child) {
  return ProviderScope(
    overrides: [appDependenciesProvider.overrideWithValue(harness.dependencies)],
    child: MaterialApp(theme: buildAppTheme(), home: Scaffold(body: child)),
  );
}

void main() {
  setUpAll(initializeTimeZones);

  testWidgets('Today lists seeded tasks and marks the completed one', (tester) async {
    final harness = await _createHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(_wrap(harness, const TodayScreen()));
    await tester.pumpAndSettle();

    expect(find.textContaining('小苔'), findsOneWidget);
    expect(find.text('阿肥 · 餵食'), findsOneWidget);
    expect(find.text('小綠 · 換水'), findsOneWidget);
    expect(find.text('慢慢 · 巡視環境'), findsOneWidget);
    expect(find.textContaining('已完成 · 阿川'), findsOneWidget);
    expect(find.text('待完成 2'), findsOneWidget);
  });

  testWidgets('Today completes a task through the outbox', (tester) async {
    final harness = await _createHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(_wrap(harness, const TodayScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('阿肥 · 餵食'));
    await tester.pumpAndSettle();

    expect(find.textContaining('已完成'), findsWidgets);
    // The mock store now holds a completion for today's feeding reminder.
    expect(
      harness.store.completions.values.any(
        (completion) => completion.reminderId == 'rem_afa_feed' && completion.completedByName == '小苔',
      ),
      isTrue,
    );
    expect(await harness.dependencies.outbox.pendingEntries(), isEmpty);
  });

  testWidgets('Animals shows every seeded resident', (tester) async {
    final harness = await _createHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(_wrap(harness, const AnimalsScreen()));
    await tester.pumpAndSettle();

    expect(find.text('阿肥'), findsOneWidget);
    expect(find.text('小綠'), findsOneWidget);
    expect(find.text('慢慢'), findsOneWidget);
    expect(find.textContaining('3 位居民'), findsOneWidget);
    expect(find.text('豹紋守宮 · Hypo'), findsOneWidget);
  });
}
