import { PARENT_PLATFORM_FEE_MULTIPLIER } from "@/lib/sitter/public-search-card";

export type ParentPaymentSplit = {
  totalNis: number;
  sitterBaseNis: number;
  platformFeeNis: number;
  platformFeeMinorUnits: number;
  totalMinorUnits: number;
};

/** Parent total is all-inclusive (sitter base + flat 10% platform fee). */
export function computePlatformFeeFromParentTotal(totalNis: number): ParentPaymentSplit {
  const safeTotal = Math.max(0, Math.round(totalNis * 100) / 100);
  const sitterBaseNis = Math.round((safeTotal / PARENT_PLATFORM_FEE_MULTIPLIER) * 100) / 100;
  const platformFeeNis = Math.round((safeTotal - sitterBaseNis) * 100) / 100;
  const totalMinorUnits = Math.max(0, Math.round(safeTotal * 100));
  const platformFeeMinorUnits = Math.max(0, Math.round(platformFeeNis * 100));

  return {
    totalNis: safeTotal,
    sitterBaseNis,
    platformFeeNis,
    platformFeeMinorUnits,
    totalMinorUnits
  };
}

export function computePlatformFeeFromMinorUnits(amountMinorUnits: number): ParentPaymentSplit {
  return computePlatformFeeFromParentTotal(amountMinorUnits / 100);
}
