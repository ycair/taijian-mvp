import 'dart:async';

import 'package:http/http.dart' as http;

import '../../core/config/app_config.dart';
import '../../core/models/models.dart';
import '../../data/supabase/auth_models.dart';
import '../../data/supabase/google_sdk_adapter.dart';
import '../../data/supabase/line_sdk_adapter.dart';
import '../../data/supabase/secure_token_store.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';
import 'auth_service.dart';

class SupabaseAuthService implements AuthService {
  SupabaseAuthService({
    required this.config,
    required this.tokenStore,
    required this.lineSdk,
    GoogleSdkAdapter? googleSdk,
    http.Client? httpClient,
  }) : googleSdk = googleSdk ?? NativeGoogleSdkAdapter() {
    _client = SupabaseRestClient(
      baseUrl: config.supabaseUrl,
      apiKey: config.supabaseAnonKey,
      tokenProvider: () => _accessToken,
      onUnauthorized: _refreshAccessToken,
      httpClient: httpClient,
    );
  }

  final AppConfig config;
  final TokenStore tokenStore;
  final LineSdkAdapter lineSdk;
  final GoogleSdkAdapter googleSdk;
  late final SupabaseRestClient _client;
  final StreamController<AppUser?> _controller =
      StreamController<AppUser?>.broadcast();

  String? _accessToken;
  String? _refreshToken;
  AppUser? _current;

  String? get token => _accessToken;

  @override
  AppUser? get currentUser => _current;

  @override
  Stream<AppUser?> authStateChanges() async* {
    yield _current;
    yield* _controller.stream;
  }

  Future<void> initialize() async {
    final access = await tokenStore.readAccessToken();
    final refresh = await tokenStore.readRefreshToken();
    final userId = await tokenStore.readUserId();
    if (access == null ||
        access.isEmpty ||
        refresh == null ||
        refresh.isEmpty ||
        userId == null ||
        userId.isEmpty) {
      return;
    }

    _accessToken = access;
    _refreshToken = refresh;
    try {
      _current = await _loadUser(userId);
    } on SupabaseApiException catch (error) {
      if (!error.isAuthError) {
        await _clearSession();
        return;
      }
      try {
        _current = await _refreshSession();
      } catch (_) {
        await _clearSession();
      }
    } catch (_) {
      await _clearSession();
    }
  }

  @override
  Future<AppUser> signInWithLine() async {
    try {
      await lineSdk.setup(config.lineChannelId);
      final session = await lineSdk.login();
      if (session.idToken.isEmpty) {
        throw const AuthException('LINE 沒有回傳 ID token。', code: 'NO_ID_TOKEN');
      }
      final response = await _client.callFunction(
        'auth',
        {'action': 'line', 'idToken': session.idToken, 'platform': 'ios'},
        authenticated: false,
      );
      return await _applyAuthResponse(response, fallbackName: session.displayName);
    } on LineSdkException catch (error) {
      throw AuthException(
        error.message,
        code: error.code == 'CANCELLED' ? 'CANCELLED' : 'LINE_FAILED',
      );
    } on SupabaseApiException catch (error) {
      throw AuthException(error.message, code: error.code);
    }
  }

  @override
  Future<AppUser> signInWithGoogle() async {
    if (!config.googleConfigured) {
      throw const AuthException(
        'Google 登入尚未設定 Client ID。',
        code: 'GOOGLE_NOT_CONFIGURED',
      );
    }
    try {
      await googleSdk.setup(
        iosClientId: config.googleIosClientId,
        serverClientId: config.googleServerClientId,
      );
      final session = await googleSdk.login();
      final response = await _client.callFunction(
        'auth',
        {'action': 'google', 'idToken': session.idToken, 'platform': 'ios'},
        authenticated: false,
      );
      return await _applyAuthResponse(response, fallbackName: session.displayName);
    } on GoogleSdkException catch (error) {
      throw AuthException(
        error.message,
        code: error.code == 'CANCELLED' ? 'CANCELLED' : 'GOOGLE_FAILED',
      );
    } on SupabaseApiException catch (error) {
      throw AuthException(error.message, code: error.code);
    }
  }

  @override
  Future<AppUser> signInAsGuest() async {
    final response = await _client.callFunction(
      'auth',
      {'action': 'guest', 'platform': 'ios'},
      authenticated: false,
    );
    return await _applyAuthResponse(response, fallbackName: '苔友');
  }

  @override
  Future<void> linkProvider(String provider) async {
    if (provider != 'line' && provider != 'google') {
      throw const AuthException('不支援這個登入方式。', code: 'UNSUPPORTED');
    }
    if (_accessToken == null) {
      throw const AuthException('請先登入。', code: 'UNAUTHENTICATED');
    }
    String idToken;
    if (provider == 'line') {
      await lineSdk.setup(config.lineChannelId);
      final session = await lineSdk.login();
      idToken = session.idToken;
    } else {
      if (!config.googleConfigured) {
        throw const AuthException('Google 尚未設定 Client ID。', code: 'GOOGLE_NOT_CONFIGURED');
      }
      await googleSdk.setup(
        iosClientId: config.googleIosClientId,
        serverClientId: config.googleServerClientId,
      );
      idToken = (await googleSdk.login()).idToken;
    }
    final response = await _client.callFunction('auth', {
      'action': 'link',
      'provider': provider,
      'idToken': idToken,
    });
    _throwIfFailed(response);
  }

  @override
  Future<void> unlinkProvider(String provider) async {
    if (provider != 'line' && provider != 'google') {
      throw const AuthException('不支援這個登入方式。', code: 'UNSUPPORTED');
    }
    final response = await _client.callFunction('auth', {
      'action': 'unlink',
      'provider': provider,
    });
    _throwIfFailed(response);
  }

  @override
  Future<void> deleteAccount() async {
    final response = await _client.callFunction('auth', {
      'action': 'delete',
      'confirm': 'DELETE',
    });
    _throwIfFailed(response);
    await _logoutProviders();
    await _clearSession();
  }

  @override
  Future<void> signOut() async {
    if (_accessToken != null) {
      try {
        await _client.callFunction('auth', {'action': 'logout'});
      } catch (_) {
        // Local sign-out still proceeds when the network is unavailable.
      }
    }
    await _logoutProviders();
    await _clearSession();
  }

  Future<AppUser> _applyAuthResponse(
    Map<String, dynamic> response, {
    String? fallbackName,
  }) async {
    _throwIfFailed(response);
    final session = AuthSession.fromResponse(response);
    _accessToken = session.accessToken;
    _refreshToken = session.refreshToken;
    _current = _userFromProfile(session, fallbackName: fallbackName);
    await tokenStore.save(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.userId,
    );
    _controller.add(_current);
    return _current!;
  }

  Future<AppUser> _refreshSession() async {
    final refresh = _refreshToken;
    if (refresh == null) throw const AuthException('登入已過期。', code: 'UNAUTHENTICATED');
    final response = await _client.callFunction(
      'auth',
      {'action': 'refresh', 'refreshToken': refresh},
      authenticated: false,
    );
    return await _applyAuthResponse(response);
  }

  Future<String?> _refreshAccessToken() async {
    try {
      await _refreshSession();
      return _accessToken;
    } catch (_) {
      await _clearSession();
      return null;
    }
  }

  Future<AppUser> _loadUser(String userId) async {
    final results = await Future.wait([
      _client.select('profiles', query: 'select=*&id=eq.${_value(userId)}'),
      _client.select(
        'household_members',
        query: 'select=household_id&user_id=eq.${_value(userId)}',
      ),
    ]);
    if (results[0].isEmpty) {
      throw const AuthException('找不到使用者資料。', code: 'PROFILE_NOT_FOUND');
    }
    return appUserFromSupabase(results[0].first, results[1]);
  }

  AppUser _userFromProfile(AuthSession session, {String? fallbackName}) {
    final profile = session.profile;
    final displayName = (profile['displayName'] as String?)?.trim();
    return AppUser(
      uid: session.userId,
      displayName: displayName?.isNotEmpty == true
          ? displayName!
          : fallbackName?.trim().isNotEmpty == true
          ? fallbackName!
          : '苔友',
      avatarUrl: profile['avatarUrl'] as String?,
      timezone: (profile['timezone'] as String?) ?? 'Asia/Taipei',
      defaultHouseholdId: profile['defaultHouseholdId'] as String?,
    );
  }

  void _throwIfFailed(Map<String, dynamic> response) {
    if (response['ok'] == true) return;
    throw AuthException(
      (response['message'] as String?) ?? '登入失敗。',
      code: (response['code'] as String?) ?? 'AUTH_FAILED',
    );
  }

  Future<void> _logoutProviders() async {
    try {
      await lineSdk.logout();
    } catch (_) {}
    try {
      await googleSdk.logout();
    } catch (_) {}
  }

  Future<void> _clearSession() async {
    _accessToken = null;
    _refreshToken = null;
    _current = null;
    await tokenStore.clear();
    _controller.add(null);
  }

  String _value(String value) => Uri.encodeQueryComponent(value);

  @override
  Future<AppUser> signInWithApple() async {
    throw const AuthException('此版本不支援 Apple 登入。', code: 'UNSUPPORTED');
  }

  @override
  Future<bool> openLineLink() async => false;
}
