/**
 * Client-side password rules used by AnyNanny.
 *
 * Signup (`/register`, `/auth/sign-up`) requires a non-empty password and then
 * defers to Supabase Auth (default minimum 6 characters). The existing
 * `/reset-password` page already enforced that 6-character minimum in Hebrew.
 * Reuse that here — do not invent a stricter policy.
 */
export const MIN_PASSWORD_LENGTH = 6;

export const PASSWORD_POLICY_MESSAGES = {
  required: "נא להזין סיסמה חדשה.",
  confirmRequired: "נא לאמת את הסיסמה החדשה.",
  tooShort: "הסיסמה חייבת להכיל לפחות 6 תווים.",
  mismatch: "הסיסמאות אינן תואמות."
} as const;

export function validateNewPassword(password: string): string | null {
  if (!password) return PASSWORD_POLICY_MESSAGES.required;
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_POLICY_MESSAGES.tooShort;
  return null;
}

export function validatePasswordConfirmation(
  password: string,
  confirmPassword: string
): string | null {
  if (!confirmPassword) return PASSWORD_POLICY_MESSAGES.confirmRequired;
  if (password !== confirmPassword) return PASSWORD_POLICY_MESSAGES.mismatch;
  return null;
}
