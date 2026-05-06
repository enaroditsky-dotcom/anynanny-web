import 'package:any_nanny/core/theme/app_theme.dart';
import 'package:flutter/material.dart';

class RoleButton extends StatelessWidget {
  const RoleButton({
    required this.label,
    required this.onPressed,
    required this.isPrimary,
    super.key,
  });

  final String label;
  final VoidCallback onPressed;
  final bool isPrimary;

  @override
  Widget build(BuildContext context) {
    if (isPrimary) {
      return ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryBlue,
          foregroundColor: Colors.white,
        ),
        child: Text(label),
      );
    }

    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(54),
        foregroundColor: AppColors.accentOrange,
        side: const BorderSide(
          color: AppColors.accentOrange,
          width: 1.6,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
      ),
      child: Text(label),
    );
  }
}
