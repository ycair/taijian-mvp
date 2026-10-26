import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/bootstrap.dart';
import 'package:mobile/app/providers.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/auth/auth_service.dart';
import 'package:mobile/features/auth/sign_in_screen.dart';

import '../support/test_harness.dart';

class FakeAuthService implements AuthService {
  int lineSignIns = 0;

  @override
  AppUser? get currentUser => null;

  @override
  Stream<AppUser?> authStateChanges() => Stream<AppUser?>.value(null);

  @override
  Future<AppUser> signInWithLine() async {
    lineSignIns += 1;
    return const AppUser(uid: 'u1', displayName: '小苔');
  }

  @override
  Future<AppUser> signInWithApple() async =>
      const AppUser(uid: 'u1', displayName: '小苔');

  @override
  Future<AppUser> signInWithGoogle() async =>
      const AppUser(uid: 'u1', displayName: '小苔');

  @override
  Future<void> signOut() async {}

  @override
  Future<bool> openLineLink() async => false;
}

void main() {
  testWidgets('Supabase sign-in shows and invokes the LINE button', (
    tester,
  ) async {
    final harness = await createTestHarness(startSignedIn: false);
    addTearDown(harness.dispose);
    final auth = FakeAuthService();
    final dependencies = AppDependencies(
      config: const AppConfig(
        useMock: false,
        liffUrl: 'https://liff.line.me/2012198098-yDGNuYOH',
        appCheckDebugToken: '',
        enableAppCheck: false,
        mockStartSignedIn: false,
        useSupabase: true,
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'sb_publishable_test',
        lineChannelId: '2012198098',
      ),
      auth: auth,
      readStore: harness.dependencies.readStore,
      commandApi: harness.dependencies.commandApi,
      outbox: harness.dependencies.outbox,
      outboxDatabase: harness.dependencies.outboxDatabase,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDependenciesProvider.overrideWithValue(dependencies)],
        child: MaterialApp(theme: buildAppTheme(), home: const SignInScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('使用 LINE 登入'), findsOneWidget);
    expect(find.text('使用 Apple 登入'), findsNothing);

    await tester.tap(find.text('使用 LINE 登入'));
    await tester.pump();

    expect(auth.lineSignIns, 1);
  });
}
