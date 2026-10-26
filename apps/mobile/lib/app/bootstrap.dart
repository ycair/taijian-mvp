import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

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
import '../data/supabase/line_sdk_adapter.dart';
import '../data/supabase/secure_token_store.dart';
import '../data/supabase/supabase_command_api.dart';
import '../data/supabase/supabase_read_store.dart';
import '../data/supabase/supabase_rest_client.dart';
import '../features/auth/auth_service.dart';
import '../features/auth/firebase_auth_service.dart';
import '../features/auth/supabase_auth_service.dart';

class AppDependencies {
  const AppDependencies({
    required this.config,
    required this.auth,
    required this.readStore,
    required this.commandApi,
    required this.outbox,
    required this.outboxDatabase,
    this.push,
    this.rest,
    this.appVersion = '1.0.0',
  });

  final AppConfig config;
  final AuthService auth;
  final ReadStore readStore;
  final CommandApi commandApi;
  final Outbox outbox;
  final OutboxDatabase outboxDatabase;
  final PushService? push;
  final SupabaseRestClient? rest;
  final String appVersion;
}

/// Wires either the in-memory stack or Firebase. Mock mode never touches
/// Firebase, so no `GoogleService-Info.plist` is required.
Future<AppDependencies> bootstrap(AppConfig config) async {
  final AuthService auth;
  final ReadStore readStore;
  final CommandApi commandApi;
  PushService? push;
  SupabaseRestClient? rest;
  final appVersion = await _readAppVersion();

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
  } else if (config.useSupabase) {
    if (!config.supabaseConfigured) {
      throw StateError(
        'Supabase mode requires SUPABASE_URL, SUPABASE_ANON_KEY, and LINE_CHANNEL_ID.',
      );
    }
    final supabaseAuth = SupabaseAuthService(
      config: config,
      tokenStore: SecureTokenStore(),
      lineSdk: NativeLineSdkAdapter(),
    );
    await supabaseAuth.initialize();
    auth = supabaseAuth;
    rest = SupabaseRestClient(
      baseUrl: config.supabaseUrl,
      apiKey: config.supabaseAnonKey,
      tokenProvider: () => supabaseAuth.token,
      onUnauthorized: supabaseAuth.refreshAccessToken,
    );
    readStore = SupabaseReadStore(rest);
    commandApi = SupabaseCommandApi(rest, appVersion: appVersion);
  } else {
    final firebase = await FirebaseBootstrap(config: config).initialize();
    push = firebase;
    auth = FirebaseAuthService(config: config);
    readStore = FirestoreReadStore();
    commandApi = FirebaseCommandApi(appVersion: appVersion);
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
    rest: rest,
    appVersion: appVersion,
  );

  // Drain anything left over from a previous launch, without blocking startup.
  unawaited(
    outbox.flush().catchError((Object error) {
      debugPrint('Outbox startup flush failed (${error.runtimeType})');
      return const OutboxFlushResult();
    }),
  );

  return deps;
}

/// `package_info_plus` reads the real bundle version; fall back to a safe
/// constant only if the platform channel is unavailable (unit tests, previews).
Future<String> _readAppVersion() async {
  try {
    final info = await PackageInfo.fromPlatform();
    final version = info.version.trim();
    return version.isEmpty ? '1.0.0' : version;
  } catch (_) {
    return '1.0.0';
  }
}
