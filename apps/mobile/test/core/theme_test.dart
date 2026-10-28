import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';

void main() {
  tearDown(() => AppTokens.setDark(false));

  test('light palette uses light surfaces', () {
    AppTokens.setDark(false);
    final theme = buildAppTheme();

    expect(theme.brightness, Brightness.light);
    expect(AppTokens.card, const Color(0xFFFFFFFF));
    expect(theme.scaffoldBackgroundColor, AppTokens.bg);
  });

  test('dark palette uses dark surfaces and light text', () {
    AppTokens.setDark(true);
    final theme = buildAppTheme();

    expect(theme.brightness, Brightness.dark);
    expect(AppTokens.card, const Color(0xFF1D211C));
    expect(AppTokens.ink, const Color(0xFFF4EFE6));
    expect(theme.scaffoldBackgroundColor, AppTokens.bg);
    expect(theme.colorScheme.onSurface, AppTokens.ink);
  });
}
