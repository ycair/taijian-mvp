import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_service.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _signIn(Future<AppUser> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on AuthException catch (error) {
      if (!mounted) return;
      if (error.code != 'CANCELLED') setState(() => _error = error.message);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '登入失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authServiceProvider);
    final config = ref.watch(appConfigProvider);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 92,
                      height: 92,
                      decoration: BoxDecoration(
                        color: AppTokens.successBg,
                        borderRadius: BorderRadius.circular(30),
                        border: Border.all(color: AppTokens.butter, width: 2),
                      ),
                      child: const Icon(Icons.spa, size: 44, color: AppTokens.primaryStrong),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    '苔間',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.displaySmall?.copyWith(
                      fontWeight: FontWeight.w900,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '把每一次照顧，留在同一個家。',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppTokens.muted,
                    ),
                  ),
                  const SizedBox(height: 40),
                  if (config.useMock) ...[
                    const InlineBanner(
                      icon: Icons.science_outlined,
                      message: '測試模式：使用記憶體中的範例家庭，不會連線 Firebase。',
                      color: AppTokens.butter,
                    ),
                    const SizedBox(height: 16),
                  ],
                  FilledButton.icon(
                    onPressed: _busy ? null : () => _signIn(auth.signInWithApple),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppTokens.ink,
                      minimumSize: const Size(0, 54),
                    ),
                    icon: const Icon(Icons.apple, size: 24),
                    label: Text(config.useMock ? '使用測試帳號登入' : '使用 Apple 登入'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _signIn(auth.signInWithGoogle),
                    style: OutlinedButton.styleFrom(
                      backgroundColor: Colors.white,
                      minimumSize: const Size(0, 54),
                    ),
                    icon: Icon(Icons.g_mobiledata, size: 28, color: AppTokens.primaryStrong),
                    label: const Text('使用 Google 登入'),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppTokens.overdue, height: 1.4),
                    ),
                  ],
                  if (_busy) ...[
                    const SizedBox(height: 20),
                    const LinearProgressIndicator(
                      minHeight: 3,
                      color: AppTokens.primary,
                      backgroundColor: AppTokens.line,
                    ),
                  ],
                  const SizedBox(height: 28),
                  Text(
                    '登入即表示你同意苔間的服務條款與隱私政策。\nLINE 帳號連結會在設定中開啟 LIFF 頁面完成。',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.spa, size: 48, color: AppTokens.primary),
            SizedBox(height: 20),
            Text('苔間', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 2)),
            SizedBox(height: 20),
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5, color: AppTokens.primary),
            ),
          ],
        ),
      ),
    );
  }
}
