"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MARKETING_CONSENT_ACCEPT_LABEL,
  MARKETING_CONSENT_CHECKBOX_LABEL,
  MARKETING_CONSENT_DECLINE_LABEL,
  MARKETING_CONSENT_INTRO,
  MARKETING_CONSENT_PROMPT_TITLE,
  createMarketingConsentDecline,
  createMarketingConsentOptIn,
  loadMarketingConsentState,
  persistMarketingConsent,
  shouldShowMarketingConsentPrompt
} from "@/lib/legal/marketing-consent";

function isProductPath(pathname: string): boolean {
  return pathname === "/parent" || pathname.startsWith("/parent/") || pathname === "/sitter" || pathname.startsWith("/sitter/");
}

export function MarketingConsentPrompt() {
  const pathname = usePathname();
  const { signedIn, user, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = isProductPath(pathname);

  useEffect(() => {
    if (isLoading || !signedIn || !user?.id || !eligible) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void (async () => {
      const loaded = await loadMarketingConsentState(supabase, user.id);
      if (cancelled) return;
      setOpen(shouldShowMarketingConsentPrompt(loaded.state));
    })();

    return () => {
      cancelled = true;
    };
  }, [eligible, isLoading, signedIn, user?.id]);

  const choose = async (optedIn: boolean) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id || busy) return;

    setBusy(true);
    setError(null);
    const record = optedIn
      ? createMarketingConsentOptIn("post_login_prompt")
      : createMarketingConsentDecline();
    const saved = await persistMarketingConsent(supabase, user.id, record);
    setBusy(false);
    if (saved.error) {
      setError("לא הצלחנו לשמור את הבחירה. נסו שוב.");
      return;
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-[#001F3F]/45 p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] backdrop-blur-[2px] sm:items-center sm:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="marketing-consent-prompt-title"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#001F3F]/10 bg-white p-5 text-right shadow-xl">
        <h2 id="marketing-consent-prompt-title" className="text-lg font-bold text-[#001F3F]">
          {MARKETING_CONSENT_PROMPT_TITLE}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{MARKETING_CONSENT_INTRO}</p>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">{MARKETING_CONSENT_CHECKBOX_LABEL}</p>
        {error ? (
          <p className="mt-3 text-xs font-medium text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose(true)}
            className="w-full cursor-pointer rounded-xl bg-[#001F3F] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {MARKETING_CONSENT_ACCEPT_LABEL}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose(false)}
            className="w-full cursor-pointer rounded-xl border border-[#001F3F]/15 bg-white py-3 text-sm font-semibold text-[#001F3F] disabled:opacity-50"
          >
            {MARKETING_CONSENT_DECLINE_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
