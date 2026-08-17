"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchIdentityVerification,
  isIdentityVerified
} from "@/lib/identity/identity-verification";

export function VerifiedUserBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[13px] font-bold text-emerald-800 ring-1 ring-emerald-200/80 ${className}`}
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
      משתמש מאומת
    </span>
  );
}

/** Renders the verified badge only when identity_verification_status === "verified". */
export function IdentityVerifiedBadgeLive({
  userId,
  className = ""
}: {
  userId: string | null | undefined;
  className?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!userId) {
      setShow(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchIdentityVerification(supabase, userId);
      if (!cancelled) setShow(isIdentityVerified(result.record.status));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!show) return null;
  return <VerifiedUserBadge className={className} />;
}
