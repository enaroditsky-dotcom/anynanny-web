export type PendingVerification = {
  sitterName: string;
  idPhotoFileName: string;
  consentFormFileName: string;
  submittedAt: string;
};

export type CreatePendingVerificationInput = {
  sitterName: string;
  idPhotoFileName: string;
  consentFormFileName: string;
};
