"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchIdentityVerification,
  isIdentityVerified
} from "@/lib/identity/identity-verification";
import { VERIFIED_IDENTITY_LABEL } from "@/components/identity/verified-user-badge";

/**
 * Green overlay for a verified parent only.
 * Pending, consent, and failed statuses stay hidden — same rule as isIdentityVerified.
 */
export function ParentDashboardVerifiedBadge({ userId }: { userId: string | null }) {
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!userId) {
      setVerified(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    const load = async () => {
      const result = await fetchIdentityVerification(supabase, userId, { role: "parent" });
      if (!cancelled) setVerified(isIdentityVerified(result.record.status));
    };
    void load();
    const onPageShow = () => {
      void load();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [userId]);

  if (!verified) return null;

  return (
    <span
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-1/4 items-center justify-center"
    >
      <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#0E9F6E] px-2 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white min-[360px]:text-[11px]">
        <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">{VERIFIED_IDENTITY_LABEL}</span>
      </span>
    </span>
  );
}
