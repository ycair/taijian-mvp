import 'dart:developer' as developer;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
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
    throw const AuthException('Apple 登入已暫停。', code: 'UNSUPPORTED');
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
  Future<AppUser> signInWithLine() async {
    throw const AuthException('Firebase 版本請使用 Apple 或 Google 登入。', code: 'UNSUPPORTED');
  }

  @override
  Future<AppUser> signInAsGuest() async {
    throw const AuthException('Firebase 版本不支援訪客登入。', code: 'UNSUPPORTED');
  }

  @override
  Future<void> linkProvider(String provider) async {
    throw const AuthException('Firebase 版本不支援帳號綁定。', code: 'UNSUPPORTED');
  }

  @override
  Future<void> unlinkProvider(String provider) async {
    throw const AuthException('Firebase 版本不支援解除綁定。', code: 'UNSUPPORTED');
  }

  @override
  Future<Set<String>> linkedProviders() async => const {};

  @override
  Future<void> deleteAccount() async {
    throw const AuthException('Firebase 版本不支援刪除帳號。', code: 'UNSUPPORTED');
  }

  @override
  Future<void> signOut() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // A user who signed in with Apple has no Google session; ignore.
    }
    await _auth.signOut();

    // Firestore's on-disk cache is per app, not per account. Terminate the
    // client (which also drops its memory cache) and clear persistence so the
    // next account cannot read the previous account's cached documents.
    //
    // iOS limitation: clearPersistence() must run with no active Firestore
    // client; terminate() satisfies that, but if another Firebase component
    // re-opened it concurrently the clear can fail. Sign-out still proceeds;
    // every read query is membership-scoped by the server rules, and the next
    // sign-in replaces the auth token.
    try {
      await FirebaseFirestore.instance.terminate();
      await FirebaseFirestore.instance.clearPersistence();
      developer.log('Firestore local cache cleared on sign-out', name: 'taijian.auth');
    } catch (error) {
      developer.log(
        'Firestore cache clear failed (${error.runtimeType})',
        name: 'taijian.auth',
      );
    }
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

}
