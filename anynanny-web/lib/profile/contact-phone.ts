export const CONTACT_PHONE_INVALID_HE = "יש להזין מספר טלפון תקין";

/** Canonical stored contact phone: 10-digit Israeli mobile `05XXXXXXXX`. */
export function normalizeIsraeliMobileForStorage(raw: string): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("972")) {
    digits = `0${digits.slice(3).replace(/^0+/, "")}`;
  }
  if (/^5\d{8}$/.test(digits)) digits = `0${digits}`;
  if (!/^05\d{8}$/.test(digits)) return null;
  return digits;
}

export function formatContactPhoneDisplay(raw: string): string {
  const stored = normalizeIsraeliMobileForStorage(raw);
  if (!stored) return String(raw ?? "").trim();
  return `${stored.slice(0, 3)}-${stored.slice(3, 6)}-${stored.slice(6)}`;
}

export function validateContactPhoneInput(raw: string): string | null {
  if (!String(raw ?? "").trim()) return CONTACT_PHONE_INVALID_HE;
  if (!normalizeIsraeliMobileForStorage(raw)) return CONTACT_PHONE_INVALID_HE;
  return null;
}

export async function requestSaveOwnContactPhone(
  phone: string
): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  try {
    const response = await fetch("/api/profile/phone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ phone })
    });
    const data = (await response.json()) as { phone?: string; error?: string };
    if (!response.ok || !data.phone) {
      return { ok: false, error: data.error || CONTACT_PHONE_INVALID_HE };
    }
    return { ok: true, phone: data.phone };
  } catch {
    return { ok: false, error: "שמירת מספר הטלפון נכשלה." };
  }
}
