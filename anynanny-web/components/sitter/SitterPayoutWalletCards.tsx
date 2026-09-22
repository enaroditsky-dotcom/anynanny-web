"use client";

import { useCallback, useEffect, useState } from "react";
import { SitterManualReceivingDestinationsSection } from "@/components/sitter/SitterManualReceivingDestinationsSection";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  sitterReceivingDetailStatus,
  sitterReceivingSetupState
} from "@/lib/billing/payment-method-availability";
import {
  EMPTY_SITTER_PAYOUT_METHODS,
  fetchSitterPayoutMethods,
  preferredReceivingMethodLabel,
  type SitterPayoutMethods
} from "@/lib/wallet/sitter-payout-methods";

type SitterPayoutWalletCardsProps = {
  sitterId: string;
  /** Optional: bump from parent after Hyp return complete. */
  reloadToken?: number;
};

/**
 * Sitter receiving methods live only here, inside הארנק שלי.
 * The editor scrolls with the app shell. Credit card is not a receiving method.
 */
export function SitterPayoutWalletCards({ sitterId, reloadToken = 0 }: SitterPayoutWalletCardsProps) {
  const [methods, setMethods] = useState<SitterPayoutMethods>({ ...EMPTY_SITTER_PAYOUT_METHODS });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchSitterPayoutMethods(supabase, sitterId);
      if (!result.missingSchema) {
        setMethods(result.methods ?? { ...EMPTY_SITTER_PAYOUT_METHODS });
      } else {
        setMethods({ ...EMPTY_SITTER_PAYOUT_METHODS });
      }
    } catch (err) {
      console.warn("[sitter-payout] failed to load methods:", err);
      setMethods({ ...EMPTY_SITTER_PAYOUT_METHODS });
    } finally {
      setLoading(false);
    }
  }, [sitterId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadToken]);

  const preferredLabel = preferredReceivingMethodLabel(methods.preferred);
  const bitReady = sitterReceivingSetupState(methods, "bit").configured;
  const payboxReady = sitterReceivingSetupState(methods, "paybox").configured;
  const bitDetail = sitterReceivingDetailStatus(methods, "bit");
  const payboxDetail = sitterReceivingDetailStatus(methods, "paybox");

  return (
    <section
      dir="rtl"
      data-tour="sitter-payment-methods"
      className="min-w-0 max-w-full rounded-3xl border border-[#0B3C5D]/10 bg-white p-4 text-right shadow-soft"
    >
      <h2 className="text-sm font-bold text-navy-header">אמצעי קבלת התשלום</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
        בחרו את אמצעי קבלת התשלום המועדף. ההורים יראו אותו בפרופיל שלכם.
      </p>
      <p className="sr-only" aria-hidden="true">
        Bit ו-PayBox הם אמצעי קבלה מההורים.
        {loading ? "טוען" : preferredLabel || "לא הוגדר"}
        {" · "}
        {bitReady ? `Bit · ${bitDetail}` : bitDetail}
        {" · "}
        {payboxReady ? `PayBox · ${payboxDetail}` : payboxDetail}
      </p>
      <div className="mt-3 min-w-0" data-tour="sitter-preferred-payment">
          <SitterManualReceivingDestinationsSection
            key={reloadToken}
            sitterId={sitterId}
            onMethodsChange={setMethods}
          />
      </div>
    </section>
  );
}
