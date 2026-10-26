import 'package:google_sign_in/google_sign_in.dart';

class GoogleSession {
  const GoogleSession({
    required this.idToken,
    this.displayName,
    this.pictureUrl,
    this.email,
  });

  final String idToken;
  final String? displayName;
  final String? pictureUrl;
  final String? email;
}

class GoogleSdkException implements Exception {
  const GoogleSdkException(this.message, {this.code = 'GOOGLE_SDK_ERROR'});

  final String message;
  final String code;

  @override
  String toString() => message;
}

abstract class GoogleSdkAdapter {
  Future<void> setup({
    required String iosClientId,
    required String serverClientId,
  });

  Future<GoogleSession> login();

  Future<void> logout();
}

class NativeGoogleSdkAdapter implements GoogleSdkAdapter {
  Future<void>? _initialized;
  String? _iosClientId;
  String? _serverClientId;

  @override
  Future<void> setup({
    required String iosClientId,
    required String serverClientId,
  }) async {
    if (_initialized != null &&
        _iosClientId == iosClientId &&
        _serverClientId == serverClientId) {
      return _initialized;
    }
    _iosClientId = iosClientId;
    _serverClientId = serverClientId;
    _initialized = GoogleSignIn.instance.initialize(
      clientId: iosClientId,
      serverClientId: serverClientId,
    );
    try {
      await _initialized;
    } catch (error) {
      _initialized = null;
      throw GoogleSdkException(error.toString(), code: 'INIT_FAILED');
    }
  }

  @override
  Future<GoogleSession> login() async {
    final initialized = _initialized;
    if (initialized == null) {
      throw const GoogleSdkException('Google SDK is not initialized', code: 'NOT_CONFIGURED');
    }
    await initialized;
    try {
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw const GoogleSdkException('Google 沒有回傳 ID token。', code: 'NO_ID_TOKEN');
      }
      return GoogleSession(
        idToken: idToken,
        displayName: account.displayName,
        pictureUrl: account.photoUrl,
        email: account.email,
      );
    } on GoogleSignInException catch (error) {
      final cancelled = error.code == GoogleSignInExceptionCode.canceled;
      throw GoogleSdkException(
        error.description ?? 'Google 登入失敗',
        code: cancelled ? 'CANCELLED' : 'GOOGLE_FAILED',
      );
    }
  }

  @override
  Future<void> logout() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (error) {
      throw GoogleSdkException(error.toString(), code: 'LOGOUT_FAILED');
    }
  }
}
