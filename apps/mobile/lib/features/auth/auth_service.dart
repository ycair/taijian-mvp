import '../../core/models/models.dart';

class AuthException implements Exception {
  const AuthException(this.message, {this.code = 'AUTH_FAILED'});

  final String message;
  final String code;

  @override
  String toString() => message;
}

abstract class AuthService {
  Stream<AppUser?> authStateChanges();

  AppUser? get currentUser;

  Future<AppUser> signInWithApple();

  Future<AppUser> signInWithGoogle();

  Future<AppUser> signInWithLine() async {
    throw const AuthException('此版本不支援 LINE 登入。', code: 'UNSUPPORTED');
  }

  Future<void> signOut();

  /// LINE linking is delegated to the LIFF `/link` page. Returns false when the
  /// URL cannot be launched (for example on a simulator without a LINE app).
  Future<bool> openLineLink();
}
