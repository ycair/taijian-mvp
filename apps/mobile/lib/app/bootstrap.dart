import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/config/app_config.dart';
import '../data/command/command_api.dart';
import '../data/command/firebase_command_api.dart';
import '../data/firebase/firebase_bootstrap.dart';
import '../data/mock/mock_auth_service.dart';
import '../data/mock/mock_command_api.dart';
import '../data/mock/mock_store.dart';
import '../data/outbox/outbox.dart';
import '../data/outbox/outbox_database.dart';
import '../data/read/firestore_read_store.dart';
import '../data/read/mock_read_store.dart';
import '../data/read/read_store.dart';
import '../features/auth/auth_service.dart';
import '../features/auth/firebase_auth_service.dart';

class AppDependencies {
  const AppDependencies({
    required this.config,
    required this.auth,
    required this.readStore,
    required this.commandApi,
    required this.outbox,
    required this.outboxDatabase,
    this.push,
  });

  final AppConfig config;
  final AuthService auth;
  final ReadStore readStore;
  final CommandApi commandApi;
  final Outbox outbox;
  final OutboxDatabase outboxDatabase;
  final PushService? push;
}

/// Wires either the in-memory stack or Firebase. Mock mode never touches
/// Firebase, so no `GoogleService-Info.plist` is required.
Future<AppDependencies> bootstrap(AppConfig config) async {
  final AuthService auth;
  final ReadStore readStore;
  final CommandApi commandApi;
  PushService? push;

  if (config.useMock) {
    final store = MockStore.seeded();
    final mockAuth = MockAuthService(
      store: store,
      startSignedIn: config.mockStartSignedIn,
    );
    auth = mockAuth;
    readStore = MockReadStore(store);
    commandApi = MockCommandApi(
      store: store,
      uid: () => mockAuth.currentUser?.uid ?? '',
      latency: const Duration(milliseconds: 60),
    );
  } else {
    final firebase = await FirebaseBootstrap(config: config).initialize();
    push = firebase;
    auth = FirebaseAuthService(config: config);
    readStore = FirestoreReadStore();
    commandApi = FirebaseCommandApi();
  }

  final outboxDatabase = OutboxDatabase();
  final outbox = Outbox(
    db: outboxDatabase,
    api: commandApi,
    uid: () => auth.currentUser?.uid ?? '',
  );

  final deps = AppDependencies(
    config: config,
    auth: auth,
    readStore: readStore,
    commandApi: commandApi,
    outbox: outbox,
    outboxDatabase: outboxDatabase,
    push: push,
  );

  // Drain anything left over from a previous launch, without blocking startup.
  unawaited(outbox.flush().catchError((Object error) {
    debugPrint('Outbox startup flush failed: $error');
    return const OutboxFlushResult();
  }));

  return deps;
}
