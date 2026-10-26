import 'package:flutter/foundation.dart';

/// Compile-time configuration.
///
/// Mock mode is the default in debug builds so the app runs without Firebase
/// credentials. A release build defaults to real Firebase; opt into mock with
/// `--dart-define=USE_MOCK=true` only for demos.
class AppConfig {
  const AppConfig({
    required this.useMock,
    required this.liffUrl,
    required this.appCheckDebugToken,
    required this.enableAppCheck,
    required this.mockStartSignedIn,
    this.useSupabase = false,
    this.supabaseUrl = '',
    this.supabaseAnonKey = '',
    this.lineChannelId = '',
  });

  factory AppConfig.fromEnvironment() {
    const defined = bool.hasEnvironment('USE_MOCK');
    const definedValue = bool.fromEnvironment('USE_MOCK');
    return AppConfig(
      useMock: defined ? definedValue : !kReleaseMode,
      liffUrl: _trimTrailingSlash(
        const String.fromEnvironment(
          'LIFF_URL',
          defaultValue: 'https://liff.line.me/0000000000-taijian',
        ),
      ),
      appCheckDebugToken: const String.fromEnvironment('APP_CHECK_DEBUG_TOKEN'),
      enableAppCheck: const bool.fromEnvironment(
        'ENABLE_APP_CHECK',
        defaultValue: true,
      ),
      mockStartSignedIn: const bool.fromEnvironment(
        'MOCK_START_SIGNED_IN',
        defaultValue: true,
      ),
      useSupabase: const bool.fromEnvironment('USE_SUPABASE'),
      supabaseUrl: _trimTrailingSlash(
        const String.fromEnvironment('SUPABASE_URL'),
      ),
      supabaseAnonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
      lineChannelId: const String.fromEnvironment('LINE_CHANNEL_ID'),
    );
  }

  final bool useMock;
  final String liffUrl;
  final String appCheckDebugToken;
  final bool enableAppCheck;
  final bool mockStartSignedIn;
  final bool useSupabase;
  final String supabaseUrl;
  final String supabaseAnonKey;
  final String lineChannelId;

  bool get supabaseConfigured =>
      useSupabase &&
      supabaseUrl.isNotEmpty &&
      supabaseAnonKey.isNotEmpty &&
      lineChannelId.isNotEmpty;

  bool get liffConfigured => !liffUrl.contains('0000000000-taijian');

  String get lineLinkUrl => '$liffUrl/link';

  String inviteUrl(String token) => '$liffUrl/invite?token=$token';

  static String _trimTrailingSlash(String value) =>
      value.endsWith('/') ? value.substring(0, value.length - 1) : value;
}
