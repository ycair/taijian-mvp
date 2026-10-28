import 'package:flutter/material.dart';

/// Direction B tokens — 苔間 · 溫暖手繪.
abstract final class AppTokens {
  static bool _dark = false;

  static bool get isDark => _dark;

  static void setDark(bool value) {
    _dark = value;
  }

  static Color get bg =>
      _dark ? const Color(0xFF121511) : const Color(0xFFFFF8EE);
  static Color get ink =>
      _dark ? const Color(0xFFF4EFE6) : const Color(0xFF3B2F2A);
  static Color get primary =>
      _dark ? const Color(0xFF8EAD86) : const Color(0xFF7C9A76);
  static Color get primaryStrong =>
      _dark ? const Color(0xFFC1D8B8) : const Color(0xFF4F6B4B);
  static Color get accent =>
      _dark ? const Color(0xFFE8A87C) : const Color(0xFFE8A87C);
  static Color get butter =>
      _dark ? const Color(0xFF3B3022) : const Color(0xFFF4D9B0);
  static Color get successBg =>
      _dark ? const Color(0xFF263126) : const Color(0xFFEEF4E8);
  static Color get overdue =>
      _dark ? const Color(0xFFE58A63) : const Color(0xFFC96F4A);
  static Color get card =>
      _dark ? const Color(0xFF1D211C) : const Color(0xFFFFFFFF);
  static Color get muted =>
      _dark ? const Color(0xFFA8A096) : const Color(0xFF8A7E73);
  static Color get line =>
      _dark ? const Color(0xFF353A32) : const Color(0xFFEADCCB);
  static Color get warningBg =>
      _dark ? const Color(0xFF3A2420) : const Color(0xFFFFE7D6);
  static Color get subtleBg =>
      _dark ? const Color(0xFF242821) : const Color(0xFFF8F3EB);

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
    brightness: AppTokens.isDark ? Brightness.dark : Brightness.light,
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
    appBarTheme: AppBarTheme(
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
    dividerTheme: DividerThemeData(color: AppTokens.line, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppTokens.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: TextStyle(color: AppTokens.muted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        borderSide: BorderSide(color: AppTokens.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        borderSide: BorderSide(color: AppTokens.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        borderSide: BorderSide(color: AppTokens.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        borderSide: BorderSide(color: AppTokens.overdue),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 52),
        backgroundColor: AppTokens.primaryStrong,
        foregroundColor: AppTokens.isDark ? AppTokens.ink : Colors.white,
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusMd)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        foregroundColor: AppTokens.primaryStrong,
        side: BorderSide(color: AppTokens.line),
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
      backgroundColor: AppTokens.card,
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
      backgroundColor: AppTokens.isDark ? const Color(0xFF2C332B) : AppTokens.ink,
      contentTextStyle: const TextStyle(color: Colors.white, height: 1.4),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusSm)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
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
      backgroundColor: AppTokens.card,
      side: BorderSide(color: AppTokens.line),
      selectedColor: AppTokens.successBg,
      labelStyle: TextStyle(fontWeight: FontWeight.w700, color: AppTokens.ink),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusLg)),
    ),
  );
}
