import { PRIVACY_POLICY_V12_VERSION } from "@/lib/legal/privacy-release";

/** Local dismissal only. It is not stored as privacy acceptance. */
export const PRIVACY_V12_NOTICE_DISMISSED_KEY = "anynanny.privacy-v12-notice-dismissed";

export function shouldShowPrivacyPolicyV12Notice(input: {
  inForce: boolean;
  authenticated: boolean;
  privacyAcceptedAt: string | null;
  privacyVersion: string | null;
  dismissed: boolean;
}): boolean {
  if (!input.inForce || !input.authenticated || input.dismissed) return false;
  if (!input.privacyAcceptedAt?.trim()) return false;
  return input.privacyVersion?.trim() !== PRIVACY_POLICY_V12_VERSION;
}
