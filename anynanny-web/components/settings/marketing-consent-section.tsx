"use client";

import { Megaphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { RetroToggle, SettingsRowGroup, SettingsSubRow } from "@/components/settings/mobile-settings-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MARKETING_CONSENT_SETTINGS_LABEL,
  createMarketingConsentOptIn,
  createMarketingConsentOptOut,
  loadMarketingConsentState,
  persistMarketingConsent,
  type MarketingConsentState
} from "@/lib/legal/marketing-consent";

export function MarketingConsentSection() {
  const { user } = useAuth();
  const [state, setState] = useState<MarketingConsentState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    void (async () => {
      if (!supabase || !user?.id) {
        if (!cancelled) setHydrated(true);
        return;
      }
      const loaded = await loadMarketingConsentState(supabase, user.id);
      if (cancelled) return;
      setState(loaded.state);
      if (loaded.error) setError("לא הצלחנו לטעון את ההעדפה.");
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleChange = useCallback(
    async (next: boolean) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !user?.id || busy) return;

      setBusy(true);
      setError(null);
      const record = next
        ? createMarketingConsentOptIn("settings")
        : createMarketingConsentOptOut(state?.marketing_consent_prompted_at);
      if (state?.marketing_consent_prompted_at?.trim()) {
        record.marketing_consent_prompted_at = state.marketing_consent_prompted_at;
      }
      const saved = await persistMarketingConsent(supabase, user.id, record);
      setBusy(false);
      if (saved.error) {
        setError("לא הצלחנו לעדכן את ההעדפה. נסו שוב.");
        return;
      }
      setState({
        marketing_consent: record.marketing_consent,
        marketing_consent_at: record.marketing_consent_at,
        marketing_consent_version: record.marketing_consent_version,
        marketing_consent_source: record.marketing_consent_source,
        marketing_consent_prompted_at: record.marketing_consent_prompted_at
      });
    },
    [busy, state?.marketing_consent_prompted_at, user?.id]
  );

  if (!hydrated) return null;
  if (!state) {
    return error ? (
      <p className="mt-6 px-1 text-right text-xs font-medium text-rose-700" role="alert">
        {error}
      </p>
    ) : null;
  }

  return (
    <section className="mt-6 space-y-2.5" aria-labelledby="marketing-consent-settings-title">
      <div className="px-1 text-right">
        <h2 id="marketing-consent-settings-title" className="text-sm font-bold text-[#001F3F]">
          {MARKETING_CONSENT_SETTINGS_LABEL}
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          עדכונים, טיפים, הטבות והצעות מיוחדות ב-SMS, בדוא״ל ובהתראות דיגיטליות. לא משפיע על הודעות שירות כמו אימות, הזמנות וביטולים.
        </p>
      </div>

      <SettingsRowGroup>
        <SettingsSubRow
          label={MARKETING_CONSENT_SETTINGS_LABEL}
          hint="ניתן לבטל בכל עת. הודעות תפעוליות ימשיכו להישלח."
          trailing={
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                <Megaphone className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <RetroToggle
                checked={state.marketing_consent}
                onChange={(next) => void handleChange(next)}
                label={MARKETING_CONSENT_SETTINGS_LABEL}
                disabled={busy}
              />
            </span>
          }
        />
      </SettingsRowGroup>
      {error ? (
        <p className="px-1 text-right text-xs font-medium text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
