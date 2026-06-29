import { CARDCOM_LOW_PROFILE_CREATE_URL, resolveCardcomCreateUrl } from "@/lib/cardcom/low-profile-create";

export type CardcomCredentials = {
  terminalNumber: string;
  apiName: string;
  apiPassword: string;
  apiUrl: string;
};

/** Reads Cardcom credentials from environment (CARDCOM_* only). */
export function readCardcomCredentials(): CardcomCredentials | null {
  const terminalNumber = process.env.CARDCOM_TERMINAL_NUMBER?.trim();
  const apiName = process.env.CARDCOM_API_NAME?.trim();
  const apiPassword = process.env.CARDCOM_API_PASSWORD?.trim();

  if (!terminalNumber || !apiName || !apiPassword) {
    return null;
  }

  return {
    terminalNumber,
    apiName,
    apiPassword,
    apiUrl: resolveCardcomCreateUrl(
      process.env.CARDCOM_API_URL?.trim() ?? CARDCOM_LOW_PROFILE_CREATE_URL
    )
  };
}

export function readExpectedCardcomTerminalNumber(): string | null {
  return process.env.CARDCOM_TERMINAL_NUMBER?.trim() ?? null;
}

export function resolveCardcomWebhookUrl(request: Request): string {
  const webhookBase = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
  return `${webhookBase.replace(/\/$/, "")}/api/webhooks/cardcom`;
}
