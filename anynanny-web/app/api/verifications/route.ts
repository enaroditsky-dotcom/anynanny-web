import { createPendingVerification } from "@/lib/verifications/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();

  const sitterName = String(formData.get("sitterName") ?? "").trim();
  const idPhoto = formData.get("idPhoto");
  const consentForm = formData.get("consentForm");

  if (!sitterName || !(idPhoto instanceof File) || !(consentForm instanceof File)) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  await createPendingVerification({
    sitterName,
    idPhotoFileName: idPhoto.name,
    consentFormFileName: consentForm.name
  });

  return NextResponse.json({ ok: true });
}
