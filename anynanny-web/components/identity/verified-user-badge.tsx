"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchIdentityVerification,
  isIdentityVerified
} from "@/lib/identity/identity-verification";

export type VerifiedUserBadgeSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<
  VerifiedUserBadgeSize,
  { root: string; mark: string; icon: string; label: string }
> = {
  sm: {
    root: "gap-1 rounded-lg px-2 py-0.5",
    mark: "h-4 w-4",
    icon: "h-2.5 w-2.5",
    label: "text-[11px] font-bold leading-tight whitespace-nowrap"
  },
  md: {
    root: "gap-1.5 rounded-xl px-2.5 py-1",
    mark: "h-6 w-6",
    icon: "h-3.5 w-3.5",
    label: "text-[13px] font-bold leading-tight"
  },
  lg: {
    root: "gap-1.5 rounded-xl px-2.5 py-1.5 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2",
    mark: "h-7 w-7 sm:h-9 sm:w-9",
    icon: "h-4 w-4 sm:h-5 sm:w-5",
    label: "text-[12px] font-bold leading-snug sm:text-sm"
  },
  /** Profile / details modal: gold shield ~100% larger than the previous h-4 mark. */
  xl: {
    root: "gap-2 rounded-2xl px-3 py-1.5",
    mark: "h-8 w-8",
    icon: "h-5 w-5",
    label: "text-sm font-extrabold leading-tight tracking-wide"
  }
};

const GOLD_BADGE_SURFACE =
  "inline-flex max-w-full items-center border border-[#C5A059]/65 text-[#5C4314] " +
  "bg-[linear-gradient(165deg,#FFF9E6_0%,#F3D98A_42%,#D4A017_76%,#F6E7B0_100%)] " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_1px_3px_rgba(166,124,20,0.22)]";

const GOLD_BADGE_SURFACE_XL =
  "inline-flex max-w-full items-center border border-[#B8860B]/70 text-[#4A360E] " +
  "bg-[linear-gradient(165deg,#FFFBEA_0%,#F6E27A_28%,#D4A017_62%,#B8860B_86%,#F8E9B0_100%)] " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_2px_6px_rgba(139,105,20,0.28)]";

const GOLD_MARK_SURFACE =
  "flex shrink-0 items-center justify-center rounded-full " +
  "bg-[linear-gradient(180deg,#FFF8D4_0%,#E8C56A_55%,#C5A059_100%)] " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_1px_1px_rgba(139,105,20,0.25)] " +
  "ring-1 ring-white/55";

const GOLD_MARK_SURFACE_XL =
  "flex shrink-0 items-center justify-center rounded-full " +
  "bg-[linear-gradient(180deg,#FFFBE8_0%,#F0D56A_42%,#C9A227_78%,#A67C14_100%)] " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(139,105,20,0.3)] " +
  "ring-1 ring-white/60";

/** Gold shield mark used by the verified badge and the identity accordion header. */
export function IdentityShieldMark({
  size = "md",
  className = ""
}: {
  size?: VerifiedUserBadgeSize;
  className?: string;
}) {
  const spec = SIZE_CLASS[size];
  const markSurface = size === "xl" ? GOLD_MARK_SURFACE_XL : GOLD_MARK_SURFACE;
  return (
    <span className={`${markSurface} ${spec.mark} ${className}`} aria-hidden>
      <ShieldCheck className={`${spec.icon} text-[#001F3F]`} strokeWidth={2.25} />
    </span>
  );
}

export const VERIFIED_IDENTITY_LABEL = "זהות מאומתת";
export const VERIFIED_PARENT_IDENTITY_LABEL = "זהות ההורה אומתה";
export const VERIFIED_SITTER_IDENTITY_LABEL = "זהות הבייביסיטר אומתה";

export function VerifiedUserBadge({
  className = "",
  size = "md",
  showMark = true,
  label = VERIFIED_IDENTITY_LABEL
}: {
  className?: string;
  size?: VerifiedUserBadgeSize;
  showMark?: boolean;
  label?: string;
}) {
  const spec = SIZE_CLASS[size];
  const surface = size === "xl" ? GOLD_BADGE_SURFACE_XL : GOLD_BADGE_SURFACE;
  return (
    <span dir="rtl" className={`${surface} ${spec.root} ${className}`} aria-label={label}>
      {showMark ? <IdentityShieldMark size={size} /> : null}
      <span className={spec.label}>{label}</span>
    </span>
  );
}

/** Renders the verified badge only when identity_verification_status === "verified". */
export function IdentityVerifiedBadgeLive({
  userId,
  className = "",
  size = "md",
  label
}: {
  userId: string | null | undefined;
  className?: string;
  size?: VerifiedUserBadgeSize;
  label?: string;
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
  return <VerifiedUserBadge className={className} size={size} label={label} />;
}
