/**
 * Privacy Policy v1.2 is in force.
 * `published` and `publicationDateLabel` change together.
 * A date without publication, or publication without a date, leaves v1.2 inactive.
 */
export const PRIVACY_POLICY_V12_VERSION = "1.2" as const;
export const PRIVACY_POLICY_IN_FORCE_VERSION = "1.1" as const;
export const PRIVACY_POLICY_PREPARATION_DATE_LABEL = "19 בנובמבר 2026";

export const PRIVACY_POLICY_RELEASE: {
  published: boolean;
  publicationDateLabel: string | null;
} = {
  published: true,
  publicationDateLabel: "20 בנובמבר 2026"
};

export function isPrivacyPolicyV12InForce(): boolean {
  return (
    PRIVACY_POLICY_RELEASE.published &&
    Boolean(PRIVACY_POLICY_RELEASE.publicationDateLabel?.trim())
  );
}

/** Version written on a new acceptance. v1.2 is not recorded while the policy is a draft. */
export function acceptedPrivacyDocVersion(): typeof PRIVACY_POLICY_V12_VERSION | typeof PRIVACY_POLICY_IN_FORCE_VERSION {
  return isPrivacyPolicyV12InForce() ? PRIVACY_POLICY_V12_VERSION : PRIVACY_POLICY_IN_FORCE_VERSION;
}

export function privacyPolicyMetadataDescription(): string {
  if (isPrivacyPolicyV12InForce()) {
    return `מדיניות הפרטיות של פלטפורמת AnyNanny, גרסה 1.2. מועד פרסום: ${PRIVACY_POLICY_RELEASE.publicationDateLabel}.`;
  }
  return `מדיניות הפרטיות של פלטפורמת AnyNanny, גרסה 1.2. מועד הכנה: ${PRIVACY_POLICY_PREPARATION_DATE_LABEL}. המסמך טרם פורסם.`;
}
