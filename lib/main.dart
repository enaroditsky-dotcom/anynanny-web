import 'package:any_nanny/core/theme/app_theme.dart';
import 'package:any_nanny/features/welcome/presentation/screens/welcome_screen.dart';
import 'package:flutter/material.dart';

void main() {
  runApp(const AnyNannyApp());
}

class AnyNannyApp extends StatelessWidget {
  const AnyNannyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AnyNanny',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const WelcomeScreen(),
    );
  }
}
