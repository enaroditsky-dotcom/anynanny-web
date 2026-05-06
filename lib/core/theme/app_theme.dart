import 'package:flutter/material.dart';

class AppColors {
  static const Color primaryBlue = Color(0xFF2A5DBC);
  static const Color accentOrange = Color(0xFFF4A261);
  static const Color background = Color(0xFFF7F9FC);
  static const Color textDark = Color(0xFF1E293B);
}

class AppTheme {
  static ThemeData get lightTheme {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primaryBlue,
        brightness: Brightness.light,
      ).copyWith(
        primary: AppColors.primaryBlue,
        secondary: AppColors.accentOrange,
      ),
      scaffoldBackgroundColor: AppColors.background,
    );

    return base.copyWith(
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textDark,
      ),
      textTheme: base.textTheme.copyWith(
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: AppColors.textDark,
        ),
        bodyLarge: base.textTheme.bodyLarge?.copyWith(
          color: AppColors.textDark.withValues(alpha: 0.8),
          height: 1.45,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 16,
          ),
        ),
      ),
    );
  }
}
