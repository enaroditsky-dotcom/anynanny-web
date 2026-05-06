import { listPendingVerifications, savePendingVerification } from "@/lib/verifications/repository";
import type { CreatePendingVerificationInput, PendingVerification } from "@/lib/verifications/types";

export async function createPendingVerification(input: CreatePendingVerificationInput): Promise<PendingVerification> {
  const entry: PendingVerification = {
    sitterName: input.sitterName.trim(),
    idPhotoFileName: input.idPhotoFileName,
    consentFormFileName: input.consentFormFileName,
    submittedAt: new Date().toISOString()
  };

  await savePendingVerification(entry);
  return entry;
}

export async function getPendingVerifications(): Promise<PendingVerification[]> {
  return listPendingVerifications();
}
