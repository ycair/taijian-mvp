import 'package:flutter/services.dart';
import 'package:flutter_line_sdk/flutter_line_sdk.dart';

class LineSession {
  const LineSession({
    required this.idToken,
    this.userId,
    this.displayName,
    this.pictureUrl,
  });

  final String idToken;
  final String? userId;
  final String? displayName;
  final String? pictureUrl;
}

class LineSdkException implements Exception {
  const LineSdkException(this.message, {this.code = 'LINE_SDK_ERROR'});

  final String message;
  final String code;

  @override
  String toString() => message;
}

abstract class LineSdkAdapter {
  Future<void> setup(String channelId);

  Future<LineSession> login();

  Future<void> logout();
}

class NativeLineSdkAdapter implements LineSdkAdapter {
  bool _configured = false;

  @override
  Future<void> setup(String channelId) async {
    if (_configured) return;
    try {
      await LineSDK.instance.setup(channelId);
      _configured = true;
    } on PlatformException catch (error) {
      throw LineSdkException(
        error.message ?? 'LINE SDK 初始化失敗',
        code: error.code,
      );
    }
  }

  @override
  Future<LineSession> login() async {
    try {
      final result = await LineSDK.instance.login(
        scopes: const ['profile', 'openid'],
      );
      final idToken = result.accessToken.idTokenRaw;
      if (idToken == null || idToken.isEmpty) {
        throw const LineSdkException(
          'LINE 沒有回傳 ID token。',
          code: 'NO_ID_TOKEN',
        );
      }
      final profile = result.userProfile;
      return LineSession(
        idToken: idToken,
        userId: profile?.userId,
        displayName: profile?.displayName,
        pictureUrl: profile?.pictureUrl,
      );
    } on PlatformException catch (error) {
      final message = error.message ?? 'LINE 登入失敗';
      final code = message.toLowerCase().contains('cancel')
          ? 'CANCELLED'
          : error.code;
      throw LineSdkException(message, code: code);
    }
  }

  @override
  Future<void> logout() async {
    try {
      await LineSDK.instance.logout();
    } on PlatformException catch (error) {
      throw LineSdkException(error.message ?? 'LINE 登出失敗', code: error.code);
    }
  }
}
