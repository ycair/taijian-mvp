import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/app_theme.dart';
import 'notification_sync.dart';
import 'outbox_sync.dart';
import 'realtime_sync.dart';
import 'router.dart';

class TaijianApp extends ConsumerWidget {
  const TaijianApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return LocalNotificationSync(
      child: RealtimeSync(
        child: OutboxAutoSync(
          child: MaterialApp.router(
            title: '苔間',
            debugShowCheckedModeBanner: false,
            theme: buildAppTheme(),
            routerConfig: router,
            locale: const Locale('zh', 'TW'),
            supportedLocales: const [Locale('zh', 'TW'), Locale('en')],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
          ),
        ),
      ),
    );
  }
}
