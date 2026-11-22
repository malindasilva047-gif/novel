import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_styles.dart';

/// Dark green NovelHub theme shared with the website.
/// Prefer [AppStyles.colors] in widgets for adaptive surfaces.
class AppTheme {
  // --- Adaptive colors (prefer these over static light-only constants) ---
  static Color bgOf(BuildContext context) => AppStyles.colors(context).bg;
  static Color surfaceOf(BuildContext context) =>
      AppStyles.colors(context).card;
  static Color elevatedOf(BuildContext context) =>
      AppStyles.colors(context).elevated;
  static Color fieldOf(BuildContext context) => AppStyles.colors(context).field;
  static Color borderOf(BuildContext context) =>
      AppStyles.colors(context).border;
  static Color inkOf(BuildContext context) =>
      AppStyles.colors(context).textPrimary;
  static Color mutedOf(BuildContext context) =>
      AppStyles.colors(context).textMuted;
  static Color faintOf(BuildContext context) =>
      AppStyles.colors(context).textFaint;
  static bool isDark(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark;

  static const Color brand = AppStyles.green;
  static const Color brandDeep = AppStyles.greenDeep;
  static const Color accent = AppStyles.greenBright;
  static const Color rose = AppStyles.greenBright;
  static const Color coral = AppStyles.greenBright;
  static const Color amber = AppStyles.star;
  static const Color teal = AppStyles.green;
  static const Color sky = AppStyles.greenBright;
  static const Color mint = AppStyles.greenBright;
  static const Color pink = AppStyles.greenBright;

  static const Color ink = AppStyles.black;
  // LIGHT-only fallbacks — do not use for Scaffold/text in dual-theme UIs.
  // Prefer bgOf/surfaceOf/mutedOf(context) or AppStyles.colors(context).
  static const Color muted = Color(0xFF777777);
  static const Color surface = Colors.white;
  static const Color border = Color(0xFFDDE2DF);
  static const Color background = Color(0xFFFFFFFF);
  static const Color field = Color(0xFFF6F5FA);

  static const Color darkInk = AppStyles.white;
  static const Color darkMuted = AppStyles.whiteMuted;
  static const Color darkCard = AppStyles.blackCard;
  static const Color darkField = AppStyles.blackSoft;
  static const Color darkBorder = AppStyles.border;
  static const Color darkBg = AppStyles.black;

  static ThemeData get lightTheme {
    final base = ColorScheme.light(
      primary: AppStyles.lightAccent,
      onPrimary: Colors.white,
      secondary: AppStyles.lightGreen,
      onSecondary: Colors.white,
      surface: surface,
      onSurface: ink,
      error: AppStyles.danger,
      onError: Colors.white,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: background,
      colorScheme: base,
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: background,
        foregroundColor: ink,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppStyles.radiusMd),
          side: const BorderSide(color: border),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppStyles.lightGreen,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppStyles.radiusMd),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppStyles.lightGreen,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppStyles.radiusMd),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppStyles.lightAccent,
          side: BorderSide(color: AppStyles.lightGreen.withValues(alpha: 0.4)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppStyles.radiusMd),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: field,
        hintStyle: const TextStyle(color: muted),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 16,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: brand, width: 1.6),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: border),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: brand.withValues(alpha: 0.18),
        height: 70,
        labelTextStyle: WidgetStateProperty.resolveWith((s) {
          final sel = s.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11,
            fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
            color: sel ? AppStyles.lightAccent : muted,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((s) {
          final sel = s.contains(WidgetState.selected);
          return IconThemeData(size: 24, color: sel ? AppStyles.lightAccent : muted);
        }),
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: AppStyles.lightAccent,
        unselectedLabelColor: muted,
      indicatorColor: AppStyles.lightGreen,
      ),
      dividerTheme: const DividerThemeData(color: border, thickness: 0.8),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: ink,
        contentTextStyle: const TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      listTileTheme: const ListTileThemeData(
        textColor: ink,
        iconColor: brandDeep,
      ),
    );
  }

  static ThemeData get darkTheme {
    final scheme = ColorScheme.dark(
      primary: brand,
      onPrimary: Colors.white,
      secondary: brandBrightCompat,
      onSecondary: darkBg,
      surface: darkCard,
      onSurface: darkInk,
      error: AppStyles.danger,
      onError: Colors.white,
      surfaceContainerHighest: darkField,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: darkBg,
      colorScheme: scheme,
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: darkBg,
        foregroundColor: darkInk,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: SystemUiOverlayStyle.light,
      ),
      cardTheme: CardThemeData(
        color: darkCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppStyles.radiusMd),
          side: const BorderSide(color: darkBorder),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: darkField,
        selectedColor: brand.withValues(alpha: 0.28),
        side: const BorderSide(color: darkBorder),
        labelStyle: const TextStyle(
          color: darkInk,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: brandBrightCompat,
          side: BorderSide(color: brand.withValues(alpha: 0.45)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: brandBrightCompat),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: brand,
        foregroundColor: Colors.white,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppStyles.blackElevated,
        elevation: 0,
        height: 70,
        indicatorColor: brand.withValues(alpha: 0.22),
        labelTextStyle: WidgetStateProperty.resolveWith((s) {
          final sel = s.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11,
            fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
            color: sel ? brand : darkMuted,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((s) {
          final sel = s.contains(WidgetState.selected);
          return IconThemeData(size: 24, color: sel ? brand : darkMuted);
        }),
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: brand,
        unselectedLabelColor: darkMuted,
        indicatorColor: brand,
        dividerColor: darkBorder,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: darkCard,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: darkCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: darkField,
        contentTextStyle: const TextStyle(color: darkInk),
        actionTextColor: brand,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      listTileTheme: const ListTileThemeData(
        textColor: darkInk,
        iconColor: brand,
        subtitleTextStyle: TextStyle(color: darkMuted),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: brand,
        circularTrackColor: darkField,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: darkField,
        hintStyle: const TextStyle(color: darkMuted),
        labelStyle: const TextStyle(color: darkMuted),
        prefixIconColor: brand,
        suffixIconColor: darkMuted,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 16,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: darkBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: brand, width: 1.6),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: darkBorder),
        ),
      ),
      dividerTheme: const DividerThemeData(color: darkBorder, thickness: 0.8),
      popupMenuTheme: const PopupMenuThemeData(
        color: darkCard,
        textStyle: TextStyle(color: darkInk),
      ),
    );
  }
}

const Color brandBrightCompat = AppStyles.greenBright;
