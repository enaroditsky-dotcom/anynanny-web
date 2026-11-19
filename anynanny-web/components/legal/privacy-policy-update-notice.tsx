"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import {
  PRIVACY_V12_NOTICE_DISMISSED_KEY,
  shouldShowPrivacyPolicyV12Notice
} from "@/lib/legal/privacy-policy-notice";
import { isPrivacyPolicyV12InForce } from "@/lib/legal/privacy-release";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

function noticeDismissed(): boolean {
  try {
    return window.localStorage.getItem(PRIVACY_V12_NOTICE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Non-blocking notice for users who already accepted an earlier privacy version.
 * Inactive until v1.2 is published. Dismissal is local and is not consent.
 */
export function PrivacyPolicyUpdateNotice() {
  const inForce = isPrivacyPolicyV12InForce();
  const { signedIn, user, isLoading } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!inForce || isLoading || !signedIn || !user?.id) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void (async () => {
      const existing = await supabase
        .from(PROFILES_TABLE)
        .select("privacy_accepted_at, privacy_version")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || existing.error) return;
      const row = (existing.data ?? {}) as {
        privacy_accepted_at?: string | null;
        privacy_version?: string | null;
      };
      setVisible(
        shouldShowPrivacyPolicyV12Notice({
          inForce,
          authenticated: true,
          privacyAcceptedAt: row.privacy_accepted_at ?? null,
          privacyVersion: row.privacy_version ?? null,
          dismissed: noticeDismissed()
        })
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [inForce, isLoading, signedIn, user?.id]);

  if (!inForce || !visible) return null;

  return (
    <div
      className="mb-3 rounded-2xl border border-[#001F3F]/15 bg-white px-4 py-3 text-right text-sm text-[#001F3F] shadow-sm"
      role="status"
    >
      <p className="font-bold">מדיניות הפרטיות עודכנה לגרסה 1.2</p>
      <p className="mt-1 leading-relaxed text-slate-600">
        אפשר לקרוא את הגרסה המפורסמת בעמוד{" "}
        <Link href="/privacy" className="font-semibold text-[#001F3F] underline">
          מדיניות הפרטיות
        </Link>
        . סגירת ההודעה אינה הסכמה חדשה ואינה משנה אישור קודם.
      </p>
      <button
        type="button"
        className="mt-2 min-h-11 rounded-xl px-3 text-sm font-bold text-[#001F3F] underline"
        onClick={() => {
          try {
            window.localStorage.setItem(PRIVACY_V12_NOTICE_DISMISSED_KEY, "1");
          } catch {
            // Hiding the notice still does not write an acceptance.
          }
          setVisible(false);
        }}
      >
        סגירה
      </button>
    </div>
  );
}
