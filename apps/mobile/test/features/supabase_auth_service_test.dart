import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/data/supabase/line_sdk_adapter.dart';
import 'package:mobile/data/supabase/secure_token_store.dart';
import 'package:mobile/features/auth/auth_service.dart';
import 'package:mobile/features/auth/supabase_auth_service.dart';

class FakeLineSdk implements LineSdkAdapter {
  FakeLineSdk({this.session});
  LineSession? session;
  String? setupChannelId;
  bool loggedOut = false;

  @override
  Future<void> setup(String channelId) async {
    setupChannelId = channelId;
  }

  @override
  Future<LineSession> login() async {
    final value = session;
    if (value == null) {
      throw const LineSdkException('cancelled', code: 'CANCELLED');
    }
    return value;
  }

  @override
  Future<void> logout() async {
    loggedOut = true;
  }
}

class MemoryTokenStore implements TokenStore {
  String? token;
  String? userId;
  int clears = 0;

  @override
  Future<String?> readToken() async => token;

  @override
  Future<String?> readUserId() async => userId;

  @override
  Future<void> save({required String token, required String userId}) async {
    this.token = token;
    this.userId = userId;
  }

  @override
  Future<void> clear() async {
    token = null;
    userId = null;
    clears += 1;
  }
}

void main() {
  SupabaseAuthService auth({
    required FakeLineSdk line,
    required MemoryTokenStore store,
    required Future<http.Response> Function(http.Request) handler,
  }) {
    return SupabaseAuthService(
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
      tokenStore: store,
      lineSdk: line,
      httpClient: MockClient(handler),
    );
  }

  test('signs in with native LINE and stores the custom token', () async {
    final store = MemoryTokenStore();
    final line = FakeLineSdk(
      session: const LineSession(
        idToken: 'line-id-token',
        userId: 'Uline',
        displayName: 'LINE 名稱',
        pictureUrl: 'https://example.com/avatar.png',
      ),
    );
    final requests = <http.Request>[];
    final service = auth(
      line: line,
      store: store,
      handler: (request) async {
        requests.add(request);
        if (request.url.path == '/functions/v1/line-login') {
          return http.Response.bytes(
            utf8.encode(
              jsonEncode({
                'ok': true,
                'token': 'custom-jwt',
                'userId': 'u1',
                'profile': {
                  'id': 'u1',
                  'displayName': 'LINE 名稱',
                  'avatarUrl': 'https://example.com/avatar.png',
                  'timezone': 'Asia/Taipei',
                  'defaultHouseholdId': null,
                },
              }),
            ),
            200,
          );
        }
        return http.Response('[]', 200);
      },
    );

    final user = await service.signInWithLine();

    expect(user.uid, 'u1');
    expect(user.displayName, 'LINE 名稱');
    expect(service.currentUser?.uid, 'u1');
    expect(service.token, 'custom-jwt');
    expect(store.token, 'custom-jwt');
    expect(store.userId, 'u1');
    expect(line.setupChannelId, '2012198098');
    expect(requests.single.url.path, '/functions/v1/line-login');
    expect(requests.single.headers.containsKey('authorization'), isFalse);
  });

  test('missing native ID token does not store a token', () async {
    final store = MemoryTokenStore();
    final service = auth(
      line: FakeLineSdk(session: const LineSession(idToken: '')),
      store: store,
      handler: (_) async => http.Response('{}', 500),
    );

    await expectLater(service.signInWithLine(), throwsA(isA<AuthException>()));
    expect(store.token, isNull);
    expect(service.currentUser, isNull);
  });

  test('a failed line-login response does not store a token', () async {
    final store = MemoryTokenStore();
    final service = auth(
      line: FakeLineSdk(session: const LineSession(idToken: 'line-id-token')),
      store: store,
      handler: (_) async => http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'ok': false,
            'message': 'LINE token verification failed',
          }),
        ),
        200,
      ),
    );

    await expectLater(service.signInWithLine(), throwsA(isA<AuthException>()));
    expect(store.token, isNull);
  });

  test('initialize clears an expired stored token', () async {
    final store = MemoryTokenStore()
      ..token = 'expired-jwt'
      ..userId = 'u1';
    final service = auth(
      line: FakeLineSdk(),
      store: store,
      handler: (_) async => http.Response.bytes(
        utf8.encode(
          jsonEncode({'code': '42501', 'message': 'permission denied'}),
        ),
        401,
      ),
    );

    await service.initialize();

    expect(service.currentUser, isNull);
    expect(store.token, isNull);
    expect(store.clears, 1);
  });
}
