import 'package:flutter/material.dart';

/// Direction B tokens — 苔間 · 溫暖手繪.
abstract final class AppTokens {
  static const bg = Color(0xFFFFF8EE);
  static const ink = Color(0xFF3B2F2A);
  static const primary = Color(0xFF7C9A76);
  static const primaryStrong = Color(0xFF4F6B4B);
  static const accent = Color(0xFFE8A87C);
  static const butter = Color(0xFFF4D9B0);
  static const successBg = Color(0xFFEEF4E8);
  static const overdue = Color(0xFFC96F4A);
  static const card = Color(0xFFFFFFFF);
  static const muted = Color(0xFF8A7E73);
  static const line = Color(0xFFEADCCB);

  static const radiusSm = 12.0;
  static const radiusMd = 18.0;
  static const radiusLg = 24.0;

  static const space = <double>[4, 8, 12, 16, 24, 32];

  static const avatarPalette = <String>[
    '#7C9A76',
    '#E8A87C',
    '#F4D9B0',
    '#A8BFA3',
    '#D9A5A0',
    '#9EADB8',
    '#C7B198',
  ];

  static Color colorFromHex(String hex) {
    final cleaned = hex.replaceFirst('#', '');
    final value = int.tryParse(cleaned, radix: 16);
    if (value == null) return primary;
    return Color(0xFF000000 | value);
  }
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppTokens.primary,
    brightness: Brightness.light,
    surface: AppTokens.bg,
    onSurface: AppTokens.ink,
    primary: AppTokens.primary,
    onPrimary: Colors.white,
    secondary: AppTokens.accent,
    onSecondary: AppTokens.ink,
    error: AppTokens.overdue,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppTokens.bg,
    splashFactory: InkSparkle.splashFactory,
  );

  final textTheme = base.textTheme
      .apply(bodyColor: AppTokens.ink, displayColor: AppTokens.ink)
      .copyWith(
        headlineSmall: base.textTheme.headlineSmall?.copyWith(
          fontWeight: FontWeight.w800,
          height: 1.3,
          letterSpacing: -0.2,
        ),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          height: 1.3,
        ),
        titleMedium: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.5),
        bodySmall: base.textTheme.bodySmall?.copyWith(color: AppTokens.muted, height: 1.4),
        labelLarge: base.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      );

  return base.copyWith(
    textTheme: textTheme,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppTokens.bg,
      foregroundColor: AppTokens.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: AppTokens.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusLg)),
    ),
    dividerTheme: const DividerThemeData(color: AppTokens.line, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: const TextStyle(color: AppTokens.muted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        borderSide: const BorderSide(color: AppTokens.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        borderSide: const BorderSide(color: AppTokens.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        borderSide: const BorderSide(color: AppTokens.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        borderSide: const BorderSide(color: AppTokens.overdue),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 52),
        backgroundColor: AppTokens.primaryStrong,
        foregroundColor: Colors.white,
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusMd)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        foregroundColor: AppTokens.primaryStrong,
        side: const BorderSide(color: AppTokens.line),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusSm)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppTokens.primaryStrong,
        minimumSize: const Size(44, 44),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppTokens.successBg,
      elevation: 0,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        return TextStyle(
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
          color: states.contains(WidgetState.selected) ? AppTokens.primaryStrong : AppTokens.muted,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        return IconThemeData(
          size: 24,
          color: states.contains(WidgetState.selected) ? AppTokens.primaryStrong : AppTokens.muted,
        );
      }),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppTokens.ink,
      contentTextStyle: const TextStyle(color: Colors.white, height: 1.4),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusSm)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppTokens.bg,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppTokens.radiusLg)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: AppTokens.bg,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusLg)),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: Colors.white,
      side: const BorderSide(color: AppTokens.line),
      selectedColor: AppTokens.successBg,
      labelStyle: const TextStyle(fontWeight: FontWeight.w700, color: AppTokens.ink),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusLg)),
    ),
  );
}
