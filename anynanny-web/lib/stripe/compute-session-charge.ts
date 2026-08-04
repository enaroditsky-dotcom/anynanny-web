import { HOURLY_RATE } from "@/lib/session/protocol";

export type SessionChargeInput = {
  parent_start_shake: string | null | undefined;
  sitter_end_shake: string | null | undefined;
  billing_rate_per_minute?: number | null;
};

export type SessionChargeResult = {
  elapsedSeconds: number;
  totalMinutes: number;
  ratePerMinute: number;
  amountNis: number;
  amountMinorUnits: number;
};

function parseMs(value: string | null | undefined): number | null {
  if (value == null || String(value).trim() === "") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Server-authoritative charge from DB shake timestamps (matches billing frozen duration). */
export function computeSessionChargeFromShakes(row: SessionChargeInput): SessionChargeResult | null {
  const startMs = parseMs(row.parent_start_shake ?? null);
  const endMs = parseMs(row.sitter_end_shake ?? null);
  if (startMs == null || endMs == null) return null;

  const elapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const totalMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));

  const rateRaw = Number(row.billing_rate_per_minute);
  const ratePerMinute =
    Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : HOURLY_RATE / 60;

  const amountNis = Math.round(((elapsedSeconds / 60) * ratePerMinute) * 100) / 100;
  const amountMinorUnits = Math.max(50, Math.round(amountNis * 100));

  return {
    elapsedSeconds,
    totalMinutes,
    ratePerMinute,
    amountNis,
    amountMinorUnits
  };
}
