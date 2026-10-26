import 'dart:async';

import 'package:http/http.dart' as http;

import '../../core/config/app_config.dart';
import '../../core/models/models.dart';
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
    http.Client? httpClient,
  }) {
    _client = SupabaseRestClient(
      baseUrl: config.supabaseUrl,
      apiKey: config.supabaseAnonKey,
      tokenProvider: () => _token,
      httpClient: httpClient,
    );
  }

  final AppConfig config;
  final TokenStore tokenStore;
  final LineSdkAdapter lineSdk;
  late final SupabaseRestClient _client;
  final StreamController<AppUser?> _controller =
      StreamController<AppUser?>.broadcast();

  String? _token;
  AppUser? _current;

  String? get token => _token;

  @override
  AppUser? get currentUser => _current;

  @override
  Stream<AppUser?> authStateChanges() async* {
    yield _current;
    yield* _controller.stream;
  }

  Future<void> initialize() async {
    final token = await tokenStore.readToken();
    final userId = await tokenStore.readUserId();
    if (token == null || token.isEmpty || userId == null || userId.isEmpty) {
      return;
    }

    _token = token;
    try {
      _current = await _loadUser(userId);
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

      final response = await _client.callFunction('line-login', {
        'idToken': session.idToken,
      }, authenticated: false);
      if (response['ok'] != true) {
        throw AuthException(
          (response['message'] as String?) ?? 'LINE 登入失敗。',
          code: (response['code'] as String?) ?? 'LINE_LOGIN_FAILED',
        );
      }

      final token = response['token'];
      final userId = response['userId'];
      if (token is! String ||
          token.isEmpty ||
          userId is! String ||
          userId.isEmpty) {
        throw const AuthException(
          '登入回應缺少 token。',
          code: 'INVALID_LOGIN_RESPONSE',
        );
      }

      _token = token;
      final profile = response['profile'];
      final profileMap = profile is Map
          ? Map<String, dynamic>.from(profile)
          : const <String, dynamic>{};
      _current = AppUser(
        uid: userId,
        displayName:
            (profileMap['displayName'] as String?)?.trim().isNotEmpty == true
            ? profileMap['displayName'] as String
            : session.displayName?.trim().isNotEmpty == true
            ? session.displayName!
            : '苔友',
        avatarUrl: (profileMap['avatarUrl'] as String?) ?? session.pictureUrl,
        timezone: (profileMap['timezone'] as String?) ?? 'Asia/Taipei',
        defaultHouseholdId: profileMap['defaultHouseholdId'] as String?,
      );
      await tokenStore.save(token: token, userId: userId);
      _controller.add(_current);
      return _current!;
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
  Future<void> signOut() async {
    try {
      await lineSdk.logout();
    } catch (_) {
      // The native LINE session may already be gone; still clear the app token.
    }
    await _clearSession();
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

  Future<void> _clearSession() async {
    _token = null;
    _current = null;
    await tokenStore.clear();
    _controller.add(null);
  }

  String _value(String value) => Uri.encodeQueryComponent(value);

  @override
  Future<AppUser> signInWithApple() async {
    throw const AuthException('此版本請使用 LINE 登入。', code: 'UNSUPPORTED');
  }

  @override
  Future<AppUser> signInWithGoogle() async {
    throw const AuthException('此版本請使用 LINE 登入。', code: 'UNSUPPORTED');
  }

  @override
  Future<bool> openLineLink() async => false;
}
