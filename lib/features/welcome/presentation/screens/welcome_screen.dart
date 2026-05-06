import 'package:any_nanny/core/theme/app_theme.dart';
import 'package:any_nanny/widgets/role_button.dart';
import 'package:flutter/material.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: Container(
                  height: 48,
                  width: 48,
                  decoration: BoxDecoration(
                    color: AppColors.accentOrange.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.child_care_rounded,
                    color: AppColors.accentOrange,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                'Welcome to AnyNanny',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              Text(
                'Find trusted childcare support or offer your babysitting services with confidence.',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 36),
              RoleButton(
                label: 'I am a Parent',
                isPrimary: true,
                onPressed: () {},
              ),
              const SizedBox(height: 14),
              RoleButton(
                label: 'I am a Babysitter',
                isPrimary: false,
                onPressed: () {},
              ),
              const SizedBox(height: 20),
              Center(
                child: Text(
                  'Safe. Simple. Reliable.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppColors.textDark.withValues(alpha: 0.55),
                      ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}
