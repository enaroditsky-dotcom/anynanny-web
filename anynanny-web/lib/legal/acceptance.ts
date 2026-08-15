export const LEGAL_DOC_VERSION = "1.0" as const;

export type LegalAcceptanceRecord = {
  terms_accepted_at: string;
  terms_version: string;
  privacy_accepted_at: string;
  privacy_version: string;
};

export function createLegalAcceptanceRecord(
  acceptedAt = new Date().toISOString()
): LegalAcceptanceRecord {
  return {
    terms_accepted_at: acceptedAt,
    terms_version: LEGAL_DOC_VERSION,
    privacy_accepted_at: acceptedAt,
    privacy_version: LEGAL_DOC_VERSION
  };
}
