export function vapidPublicKeyToUint8Array(base64Url: string): Uint8Array {
  const trimmed = base64Url.trim();
  if (!trimmed) throw new Error("missing VAPID public key");
  const padding = "=".repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function readPublicVapidKey(): string {
  return String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
}
