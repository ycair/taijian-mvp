import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/app/app.dart';
import 'package:mobile/app/bootstrap.dart';
import 'package:mobile/app/providers.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/core/models/command_result.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/data/command/command_api.dart';
import 'package:mobile/data/mock/mock_auth_service.dart';
import 'package:mobile/data/mock/mock_command_api.dart';
import 'package:mobile/data/mock/mock_store.dart';
import 'package:mobile/data/outbox/outbox.dart';
import 'package:mobile/data/outbox/outbox_database.dart';
import 'package:mobile/data/read/mock_read_store.dart';

class TestHarness {
  TestHarness({
    required this.store,
    required this.auth,
    required this.api,
    required this.database,
    required this.dependencies,
  });

  final MockStore store;
  final MockAuthService auth;
  final CommandApi api;
  final OutboxDatabase database;
  final AppDependencies dependencies;
  bool _disposed = false;

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await database.close();
    store.dispose();
    auth.dispose();
  }
}

Future<TestHarness> createTestHarness({
  bool startSignedIn = true,
  CommandApi Function(MockAuthService auth)? apiBuilder,
}) async {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  final store = MockStore.seeded();
  final auth = MockAuthService(store: store, startSignedIn: startSignedIn);
  final database = OutboxDatabase.withExecutor(NativeDatabase.memory());
  final api =
      apiBuilder?.call(auth) ??
      MockCommandApi(
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
  return TestHarness(
    store: store,
    auth: auth,
    api: api,
    database: database,
    dependencies: dependencies,
  );
}

Widget wrapScreen(TestHarness harness, Widget child) {
  return ProviderScope(
    overrides: [
      appDependenciesProvider.overrideWithValue(harness.dependencies),
      // Drift stream queries keep zero-delay timers alive during widget-test
      // teardown. These screens do not need live queue state; use the database
      // directly in tests that need to inspect rows.
      outboxEntriesProvider.overrideWith((ref) => Stream.value(const <OutboxEntry>[])),
      conflictsProvider.overrideWith((ref) => Stream.value(const <OutboxEntry>[])),
    ],
    child: MaterialApp(theme: buildAppTheme(), home: Scaffold(body: child)),
  );
}

Widget wrapApp(TestHarness harness) {
  return ProviderScope(
    overrides: [
      appDependenciesProvider.overrideWithValue(harness.dependencies),
      outboxEntriesProvider.overrideWith((ref) => Stream.value(const <OutboxEntry>[])),
      conflictsProvider.overrideWith((ref) => Stream.value(const <OutboxEntry>[])),
    ],
    child: const TaijianApp(),
  );
}

/// Returns a retryable failure without touching the mock store, so outbox rows
/// stay pending and the optimistic UI can be observed.
class OfflineCommandApi implements CommandApi {
  @override
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) async {
    return CommandResult.failure(
      commandId: commandId,
      code: 'NETWORK',
      message: 'offline',
    );
  }
}
