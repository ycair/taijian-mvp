import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_config.dart';

void main() {
  const base = AppConfig(
    useMock: false,
    liffUrl: 'https://liff.line.me/test',
    appCheckDebugToken: '',
    enableAppCheck: false,
    mockStartSignedIn: false,
  );

  test('supabase mode is disabled by default', () {
    expect(base.useSupabase, isFalse);
    expect(base.supabaseConfigured, isFalse);
  });

  test(
    'supabaseConfigured requires url, publishable key, and LINE channel id',
    () {
      const configured = AppConfig(
        useMock: false,
        liffUrl: 'https://liff.line.me/test',
        appCheckDebugToken: '',
        enableAppCheck: false,
        mockStartSignedIn: false,
        useSupabase: true,
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'sb_publishable_test',
        lineChannelId: '2012198098',
      );
      expect(configured.supabaseConfigured, isTrue);

      const missingChannel = AppConfig(
        useMock: false,
        liffUrl: 'https://liff.line.me/test',
        appCheckDebugToken: '',
        enableAppCheck: false,
        mockStartSignedIn: false,
        useSupabase: true,
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'sb_publishable_test',
      );
      expect(missingChannel.supabaseConfigured, isFalse);
    },
  );
}
