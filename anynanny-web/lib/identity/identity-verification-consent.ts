/**
 * Affirmative choice to start Didit identity verification.
 * This is not privacy-policy acceptance and not a payment authorization.
 * The checkbox starts unticked. The server stores the choice on the Didit session.
 */
export const IDENTITY_VERIFICATION_CONSENT_VERSION = "1.0";

export const IDENTITY_VERIFICATION_CONSENT_STATEMENT =
  "אני מאשר/ת מרצוני למסור ל-Didit מסמך זיהוי ותמונת פנים לצורך אימות זהות ב-AnyNanny. AnyNanny תשמור את מספר תעודת הזהות שאזין, את סטטוס האימות, ופרטי החלטה כגון מספר מסמך, שם ותאריך לידה. AnyNanny אינה שומרת את קובצי התמונה. האימות אינו חובה לשימוש בחשבון ואינו נדרש לתשלום במזומן, ב-Bit או ב-PayBox.";

export function hasExplicitIdentityVerificationConsent(value: unknown): boolean {
  return value === true;
}

export function identityVerificationConsentMetadata(acceptedAt: string): {
  identity_verification_consent: true;
  identity_verification_consent_at: string;
  identity_verification_consent_version: string;
} {
  return {
    identity_verification_consent: true,
    identity_verification_consent_at: acceptedAt,
    identity_verification_consent_version: IDENTITY_VERIFICATION_CONSENT_VERSION
  };
}
