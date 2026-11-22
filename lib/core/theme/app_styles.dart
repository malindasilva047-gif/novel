import 'package:flutter/material.dart';

/// Shared NovelHub palette. Use [AppStyles.colors] for theme-aware surfaces/text.
class AppStyles {
  AppStyles._();

  // ── Brand (same in light & dark) ──────────────────────────────────────────
  static const Color black = Color(0xFF0D1914);
  static const Color blackElevated = Color(0xFF192A23);
  static const Color blackCard = Color(0xFF17211D);
  static const Color blackSoft = Color(0xFF2B3832);
  static const Color white = Color(0xFFF5F5F5);
  static const Color whiteMuted = Color(0xFF929792);
  static const Color green = Color(0xFF16856A);
  static const Color greenBright = Color(0xFF35A486);
  static const Color greenDeep = Color(0xFF35A486);
  static const Color greenDim = Color(0xFF192A23);
  static const Color coral = greenBright;

  // Legacy names remain available for existing widgets.
  static const Color purple = green;
  static const Color purpleBright = coral;
  static const Color purpleDeep = greenDeep;
  static const Color purpleDim = greenDim;
  static const Color border = Color(0xFF2B3832);
  static const Color danger = Color(0xFFFF6B6B);

  // Light companions
  static const Color lightBg = Color(0xFFFFFFFF);
  static const Color lightCard = Color(0xFFF6F5FA);
  static const Color lightField = Color(0xFFF6F5FA);
  static const Color lightBorder = Color(0xFFDDE2DF);
  static const Color lightText = Color(0xFF202020);
  static const Color lightMuted = Color(0xFF777777);
  static const Color lightGreen = Color(0xFF16785F);
  static const Color lightAccent = Color(0xFF205B4C);
  static const Color star = Color(0xFFF4CC2F);

  static const double radiusSm = 6;
  static const double radiusMd = 8;
  static const double radiusLg = 12;
  static const double radiusPill = 24;

  static const Duration animFast = Duration(milliseconds: 200);
  static const Duration animNormal = Duration(milliseconds: 320);
  static const Duration animSlow = Duration(milliseconds: 480);
  static const Curve animCurve = Curves.easeOutCubic;

  /// Theme-aware bundle — prefer this over hardcoded Colors.white / light hex.
  static AppColorBundle colors(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark ? AppColorBundle.dark : AppColorBundle.light;
  }

  static bool isDark(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark;

  static BoxDecoration cardDark({bool glow = false}) => BoxDecoration(
    color: blackCard,
    borderRadius: BorderRadius.circular(radiusMd),
    border: Border.all(color: border),
    boxShadow: glow
        ? [
            BoxShadow(
              color: green.withValues(alpha: 0.22),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ]
        : [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
  );

  static BoxDecoration card(BuildContext context, {bool glow = false}) {
    final c = colors(context);
    return BoxDecoration(
      color: c.card,
      borderRadius: BorderRadius.circular(radiusMd),
      border: Border.all(color: c.border),
      boxShadow: glow
          ? [
              BoxShadow(
                color: green.withValues(alpha: 0.2),
                blurRadius: 18,
                offset: const Offset(0, 6),
              ),
            ]
          : [
              BoxShadow(
                color: Colors.black.withValues(alpha: c.isDark ? 0.35 : 0.06),
                blurRadius: 14,
                offset: const Offset(0, 4),
              ),
            ],
    );
  }

  static LinearGradient brandGradient() => const LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [greenDeep, greenBright],
  );

  static LinearGradient purpleGradient() => brandGradient();

  static LinearGradient heroGradient(BuildContext context) {
    final dark = isDark(context);
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: dark ? const [greenDeep, black] : const [green, greenBright],
    );
  }

  static ButtonStyle primaryButton() => ElevatedButton.styleFrom(
    backgroundColor: green,
    foregroundColor: Colors.white,
    elevation: 0,
    padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radiusMd),
    ),
    textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
  );
}

/// Semantic colors that flip with theme brightness.
class AppColorBundle {
  const AppColorBundle({
    required this.isDark,
    required this.bg,
    required this.card,
    required this.elevated,
    required this.field,
    required this.border,
    required this.borderSoft,
    required this.textPrimary,
    required this.textMuted,
    required this.textFaint,
    required this.brand,
    required this.brandSoft,
  });

  final bool isDark;
  final Color bg;
  final Color card;
  final Color elevated;
  final Color field;
  final Color border;
  final Color borderSoft;
  final Color textPrimary;
  final Color textMuted;
  final Color textFaint;
  final Color brand;
  final Color brandSoft;

  static const dark = AppColorBundle(
    isDark: true,
    bg: AppStyles.black,
    card: AppStyles.blackCard,
    elevated: AppStyles.blackElevated,
    field: AppStyles.blackSoft,
    border: AppStyles.border,
    borderSoft: AppStyles.border,
    textPrimary: AppStyles.white,
    textMuted: AppStyles.whiteMuted,
    textFaint: Color(0xFF7A8B80),
    brand: AppStyles.green,
    brandSoft: AppStyles.greenDim,
  );

  static const light = AppColorBundle(
    isDark: false,
    bg: AppStyles.lightBg,
    card: AppStyles.lightCard,
    elevated: AppStyles.lightField,
    field: AppStyles.lightField,
    border: AppStyles.lightBorder,
    borderSoft: AppStyles.lightBorder,
    textPrimary: AppStyles.lightText,
    textMuted: AppStyles.lightMuted,
    textFaint: Color(0xFF777777),
    brand: AppStyles.lightGreen,
    brandSoft: Color(0xFFE8F1ED),
  );
}
