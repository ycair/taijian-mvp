import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/bootstrap.dart';
import 'app/providers.dart';
import 'core/config/app_config.dart';
import 'core/theme/app_theme.dart';
import 'core/time/app_time.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  initializeTimeZones();

  final config = AppConfig.fromEnvironment();
  try {
    final dependencies = await bootstrap(config);
    runApp(
      ProviderScope(
        overrides: [appDependenciesProvider.overrideWithValue(dependencies)],
        child: const TaijianApp(),
      ),
    );
  } catch (error, stack) {
    if (!kReleaseMode) debugPrint('Bootstrap failed: $error\n$stack');
    runApp(BootstrapFailureApp(config: config, error: error));
  }
}

/// Shown instead of a white screen when Firebase cannot initialize. The common
/// cause in real mode is a missing `GoogleService-Info.plist`; mock mode never
/// reaches this screen for that reason.
class BootstrapFailureApp extends StatelessWidget {
  const BootstrapFailureApp({super.key, required this.config, required this.error});

  final AppConfig config;
  final Object error;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: Scaffold(
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(28),
            children: [
              const Icon(Icons.spa, size: 48, color: AppTokens.primary),
              const SizedBox(height: 16),
              Text('苔間無法啟動', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 12),
              Text(
                config.useMock
                    ? '測試模式初始化失敗。請確認裝置可以建立本機資料庫。'
                    : 'Firebase 初始化失敗。請確認已把 GoogleService-Info.plist 加入 ios/Runner，並在 Firebase Console 啟用 Apple / Google 登入。',
                style: const TextStyle(height: 1.5),
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(AppTokens.radiusMd),
                  border: Border.all(color: AppTokens.line),
                ),
                child: SelectableText(
                  kReleaseMode
                      ? '詳細錯誤已隱藏。請查看裝置記錄或 Xcode 主控台。'
                      : '$error',
                  style: const TextStyle(fontSize: 12, height: 1.5),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                '開發時可改用 mock 模式：\nflutter run --dart-define=USE_MOCK=true',
                style: TextStyle(fontSize: 12, color: AppTokens.muted, height: 1.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
