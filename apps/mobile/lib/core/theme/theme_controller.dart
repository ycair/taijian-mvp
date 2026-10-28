import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_theme.dart';

/// Persisted app-wide light/dark preference.
final darkModeProvider = NotifierProvider<DarkModeController, bool>(
  DarkModeController.new,
);

class DarkModeController extends Notifier<bool> {
  static const preferenceKey = 'dark_mode_enabled';

  @override
  bool build() => AppTokens.isDark;

  Future<void> setDark(bool value) async {
    AppTokens.setDark(value);
    state = value;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(preferenceKey, value);
    } catch (_) {
      // The in-memory choice still applies if preferences are unavailable.
    }
  }
}
