export class InvalidVapidPublicKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVapidPublicKeyError";
  }
}

const WRAPPING_QUOTES = new Set(['"', "'", "`"]);

/**
 * Strip the wrapping / paste artifacts that commonly break `atob()`:
 * surrounding quotes, BOM, zero-width chars, whitespace/newlines, URI encoding.
 * Does not log or return secrets beyond the cleaned key string.
 */
export function sanitizeVapidPublicKeyInput(raw: string | null | undefined): string {
  let value = String(raw ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (value.length >= 2) {
    const start = value[0];
    const end = value[value.length - 1];
    if (WRAPPING_QUOTES.has(start) && start === end) {
      value = value.slice(1, -1).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }
  }
  value = value.replace(/^public[\s_-]*key\s*[:=]\s*/i, "").trim();
  value = value.replace(/\s+/g, "");
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep sanitized value */
    }
    value = value.replace(/\s+/g, "");
  }
  return value;
}

function toStandardBase64(base64Url: string): string {
  const unpadded = base64Url.replace(/=+$/g, "");
  if (unpadded.length % 4 === 1) {
    throw new InvalidVapidPublicKeyError(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not correctly encoded"
    );
  }
  const padded = unpadded + "=".repeat((4 - (unpadded.length % 4)) % 4);
  return padded.replace(/-/g, "+").replace(/_/g, "/");
}

export function decodeUrlSafeBase64ToUint8Array(base64Url: string): Uint8Array {
  const sanitized = sanitizeVapidPublicKeyInput(base64Url);
  if (!sanitized) {
    throw new InvalidVapidPublicKeyError("NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing");
  }
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(sanitized)) {
    throw new InvalidVapidPublicKeyError(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not valid Base64 or Base64URL"
    );
  }

  const base64 = toStandardBase64(sanitized);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new InvalidVapidPublicKeyError(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not correctly encoded"
    );
  }

  let binary: string;
  try {
    binary = globalThis.atob(base64);
  } catch {
    throw new InvalidVapidPublicKeyError(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not correctly encoded"
    );
  }

  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
}

/** Uncompressed P-256 applicationServerKey: 0x04 || X || Y (65 bytes). */
export function vapidPublicKeyToUint8Array(base64Url: string): Uint8Array {
  const bytes = decodeUrlSafeBase64ToUint8Array(base64Url);
  if (bytes.length !== 65) {
    throw new InvalidVapidPublicKeyError(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not a valid VAPID public key"
    );
  }
  return bytes;
}

export function readPublicVapidKey(): string {
  return sanitizeVapidPublicKeyInput(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

export function readApplicationServerKey(): Uint8Array {
  const key = readPublicVapidKey();
  if (!key) {
    throw new InvalidVapidPublicKeyError("NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing");
  }
  return vapidPublicKeyToUint8Array(key);
}
