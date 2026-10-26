import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/data/supabase/google_sdk_adapter.dart';
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

class FakeGoogleSdk implements GoogleSdkAdapter {
  String? iosClientId;
  String? serverClientId;
  bool loggedOut = false;

  @override
  Future<void> setup({
    required String iosClientId,
    required String serverClientId,
  }) async {
    this.iosClientId = iosClientId;
    this.serverClientId = serverClientId;
  }

  @override
  Future<GoogleSession> login() async {
    return const GoogleSession(
      idToken: 'google-id-token',
      displayName: 'Google 名稱',
    );
  }

  @override
  Future<void> logout() async {
    loggedOut = true;
  }
}

class MemoryTokenStore implements TokenStore {
  String? accessToken;
  String? refreshToken;
  String? userId;
  int clears = 0;

  @override
  Future<String?> readAccessToken() async => accessToken;

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<String?> readUserId() async => userId;

  @override
  Future<void> save({
    required String accessToken,
    required String refreshToken,
    required String userId,
  }) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.userId = userId;
  }

  @override
  Future<void> clear() async {
    accessToken = null;
    refreshToken = null;
    userId = null;
    clears += 1;
  }
}

http.Response jsonResponse(Object body, [int status = 200]) {
  return http.Response.bytes(utf8.encode(jsonEncode(body)), status);
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

  test('signs in with native LINE and stores access and refresh tokens', () async {
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
        if (request.url.path == '/functions/v1/auth') {
          return jsonResponse({
            'ok': true,
            'accessToken': 'access-jwt',
            'refreshToken': 'refresh-jwt',
            'sessionId': 'session-1',
            'userId': 'u1',
            'profile': {
              'id': 'u1',
              'displayName': 'LINE 名稱',
              'avatarUrl': 'https://example.com/avatar.png',
              'timezone': 'Asia/Taipei',
              'defaultHouseholdId': null,
            },
          });
        }
        return jsonResponse([]);
      },
    );

    final user = await service.signInWithLine();

    expect(user.uid, 'u1');
    expect(user.displayName, 'LINE 名稱');
    expect(service.currentUser?.uid, 'u1');
    expect(service.token, 'access-jwt');
    expect(store.accessToken, 'access-jwt');
    expect(store.refreshToken, 'refresh-jwt');
    expect(store.userId, 'u1');
    expect(line.setupChannelId, '2012198098');
    expect(requests.single.url.path, '/functions/v1/auth');
    expect(requests.single.headers.containsKey('authorization'), isFalse);
  });

  test('guest login creates a session without a native provider', () async {
    final store = MemoryTokenStore();
    final service = auth(
      line: FakeLineSdk(),
      store: store,
      handler: (_) async => jsonResponse({
        'ok': true,
        'accessToken': 'guest-access',
        'refreshToken': 'guest-refresh',
        'sessionId': 'guest-session',
        'userId': 'guest-1',
        'profile': {
          'id': 'guest-1',
          'displayName': '苔友',
          'avatarUrl': null,
          'timezone': 'Asia/Taipei',
          'defaultHouseholdId': null,
        },
      }),
    );

    final user = await service.signInAsGuest();

    expect(user.displayName, '苔友');
    expect(store.accessToken, 'guest-access');
    expect(store.refreshToken, 'guest-refresh');
  });

  test('Google login sends its ID token to auth', () async {
    final store = MemoryTokenStore();
    final google = FakeGoogleSdk();
    final service = SupabaseAuthService(
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
        googleIosClientId: 'ios-client',
        googleServerClientId: 'server-client',
      ),
      tokenStore: store,
      lineSdk: FakeLineSdk(),
      googleSdk: google,
      httpClient: MockClient((request) async {
        expect(request.url.path, '/functions/v1/auth');
        expect(request.headers.containsKey('authorization'), isFalse);
        return jsonResponse({
          'ok': true,
          'accessToken': 'google-access',
          'refreshToken': 'google-refresh',
          'sessionId': 'google-session',
          'userId': 'google-1',
          'profile': {
            'id': 'google-1',
            'displayName': 'Google 名稱',
            'avatarUrl': null,
            'timezone': 'Asia/Taipei',
            'defaultHouseholdId': null,
          },
        });
      }),
    );

    final user = await service.signInWithGoogle();

    expect(user.uid, 'google-1');
    expect(google.iosClientId, 'ios-client');
    expect(google.serverClientId, 'server-client');
    expect(store.refreshToken, 'google-refresh');
  });

  test('missing native ID token does not store a token', () async {
    final store = MemoryTokenStore();
    final service = auth(
      line: FakeLineSdk(session: const LineSession(idToken: '')),
      store: store,
      handler: (_) async => jsonResponse({}, 500),
    );

    await expectLater(service.signInWithLine(), throwsA(isA<AuthException>()));
    expect(store.accessToken, isNull);
    expect(service.currentUser, isNull);
  });

  test('a failed auth response does not store a token', () async {
    final store = MemoryTokenStore();
    final service = auth(
      line: FakeLineSdk(session: const LineSession(idToken: 'line-id-token')),
      store: store,
      handler: (_) async => jsonResponse({'ok': false, 'message': 'LINE failed'}),
    );

    await expectLater(service.signInWithLine(), throwsA(isA<AuthException>()));
    expect(store.accessToken, isNull);
  });

  test('a 401 during bootstrap refreshes once and then loads the user', () async {
    final store = MemoryTokenStore()
      ..accessToken = 'expired-access'
      ..refreshToken = 'valid-refresh'
      ..userId = 'u1';
    var refreshed = false;
    var profileCalls = 0;
    final service = auth(
      line: FakeLineSdk(),
      store: store,
      handler: (request) async {
        if (request.url.path == '/functions/v1/auth') {
          refreshed = true;
          return jsonResponse({
            'ok': true,
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
            'sessionId': 'session-2',
            'userId': 'u1',
            'profile': {
              'id': 'u1',
              'displayName': 'Refresh',
              'avatarUrl': null,
              'timezone': 'Asia/Taipei',
              'defaultHouseholdId': null,
            },
          });
        }
        if (request.url.path == '/rest/v1/profiles') {
          profileCalls += 1;
          if (!refreshed) {
            return jsonResponse({'code': '42501', 'message': 'expired'}, 401);
          }
          return jsonResponse([
            {'id': 'u1', 'display_name': 'Refresh', 'timezone': 'Asia/Taipei'},
          ]);
        }
        return jsonResponse([]);
      },
    );

    await service.initialize();

    expect(refreshed, isTrue);
    expect(profileCalls, 2);
    expect(service.currentUser?.displayName, 'Refresh');
    expect(store.accessToken, 'new-access');
    expect(store.refreshToken, 'new-refresh');
  });

  test('initialize retains tokens on a transient failure', () async {
    final store = MemoryTokenStore()
      ..accessToken = 'access'
      ..refreshToken = 'refresh'
      ..userId = 'u1';
    final service = auth(
      line: FakeLineSdk(),
      store: store,
      handler: (_) async => jsonResponse({'message': 'unavailable'}, 503),
    );

    await service.initialize();

    expect(service.currentUser?.uid, 'u1');
    expect(store.accessToken, 'access');
    expect(store.refreshToken, 'refresh');
    expect(store.clears, 0);
  });

  test('initialize clears a session that cannot be refreshed', () async {
    final store = MemoryTokenStore()
      ..accessToken = 'expired-jwt'
      ..refreshToken = 'expired-refresh'
      ..userId = 'u1';
    final service = auth(
      line: FakeLineSdk(),
      store: store,
      handler: (_) async => jsonResponse({'code': '42501', 'message': 'permission denied'}, 401),
    );

    await service.initialize();

    expect(service.currentUser, isNull);
    expect(store.accessToken, isNull);
    expect(store.clears, greaterThan(0));
  });
}
