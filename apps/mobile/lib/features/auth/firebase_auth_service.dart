import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/models/models.dart';
import 'auth_service.dart';

class FirebaseAuthService implements AuthService {
  FirebaseAuthService({required this.config, FirebaseAuth? auth})
    : _auth = auth ?? FirebaseAuth.instance;

  final AppConfig config;
  final FirebaseAuth _auth;
  Future<void>? _googleInit;

  @override
  AppUser? get currentUser {
    final user = _auth.currentUser;
    return user == null ? null : _toAppUser(user);
  }

  @override
  Stream<AppUser?> authStateChanges() {
    return _auth.authStateChanges().map((user) => user == null ? null : _toAppUser(user));
  }

  AppUser _toAppUser(User user) {
    final name = user.displayName?.trim();
    return AppUser(
      uid: user.uid,
      displayName: name == null || name.isEmpty ? '苔友' : name,
      avatarUrl: user.photoURL,
      timezone: 'Asia/Taipei',
    );
  }

  @override
  Future<AppUser> signInWithApple() async {
    try {
      final rawNonce = _randomNonce();
      final hashedNonce = sha256.convert(utf8.encode(rawNonce)).toString();
      final appleCredential = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: hashedNonce,
      );
      final identityToken = appleCredential.identityToken;
      final authorizationCode = appleCredential.authorizationCode;
      if (identityToken == null || identityToken.isEmpty) {
        throw const AuthException('Apple 沒有回傳身分權杖，請再試一次。');
      }
      final credential = OAuthProvider('apple.com').credential(
        idToken: identityToken,
        accessToken: authorizationCode,
        rawNonce: rawNonce,
      );
      final result = await _auth.signInWithCredential(credential);
      final user = result.user;
      if (user == null) throw const AuthException('Apple 登入未完成。');
      final displayName = [
        appleCredential.givenName,
        appleCredential.familyName,
      ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' ');
      if (displayName.isNotEmpty && (user.displayName == null || user.displayName!.isEmpty)) {
        await user.updateDisplayName(displayName);
      }
      return _toAppUser(_auth.currentUser ?? user);
    } on SignInWithAppleAuthorizationException catch (error) {
      if (error.code == AuthorizationErrorCode.canceled) {
        throw const AuthException('已取消 Apple 登入。', code: 'CANCELLED');
      }
      throw AuthException('Apple 登入失敗：${error.message}', code: 'APPLE_FAILED');
    } on FirebaseAuthException catch (error) {
      throw AuthException('登入失敗：${error.message ?? error.code}', code: error.code);
    }
  }

  @override
  Future<AppUser> signInWithGoogle() async {
    try {
      await (_googleInit ??= GoogleSignIn.instance.initialize());
      final account = await GoogleSignIn.instance.authenticate(scopeHint: const ['email']);
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw const AuthException('Google 沒有回傳 ID token，請確認 iOS 設定。');
      }
      final credential = GoogleAuthProvider.credential(idToken: idToken);
      final result = await _auth.signInWithCredential(credential);
      final user = result.user;
      if (user == null) throw const AuthException('Google 登入未完成。');
      return _toAppUser(user);
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) {
        throw const AuthException('已取消 Google 登入。', code: 'CANCELLED');
      }
      throw AuthException('Google 登入失敗：${error.description ?? error.code.name}', code: 'GOOGLE_FAILED');
    } on FirebaseAuthException catch (error) {
      throw AuthException('登入失敗：${error.message ?? error.code}', code: error.code);
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // A user who signed in with Apple has no Google session; ignore.
    }
    await _auth.signOut();
  }

  @override
  Future<bool> openLineLink() async {
    final uri = Uri.tryParse(config.lineLinkUrl);
    if (uri == null) return false;
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }

  static String _randomNonce([int length = 32]) {
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List<String>.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }
}
