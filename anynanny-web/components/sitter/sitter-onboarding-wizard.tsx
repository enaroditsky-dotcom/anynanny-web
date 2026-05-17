"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  isSitterProfileComplete,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const SITTER_PROFILE_SAVED_NAV_FLAG = "anynanny_sitter_profile_saved_nav";

const inputClass =
  "mt-1 block min-h-11 min-w-0 w-full rounded-lg border border-navy-header/20 p-2 text-right text-sm";

/** DB columns: full_name, bio, years_experience, hourly_rate_nis (+ updated_at). nanny_id_number is DB-trigger only. */
type SitterOnboardingWizardProps = {
  /** Fires after a successful upsert (before redirect) so dashboard can refresh nanny ID badge. */
  onSaved?: () => void;
};

export function SitterOnboardingWizard({ onSaved }: SitterOnboardingWizardProps = {}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loadHint, setLoadHint] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [hourlyRateNis, setHourlyRateNis] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setLoadHint("לא ניתן להתחבר למסד הנתונים מהדפדפן.");
          setReady(true);
        }
        return;
      }

      try {
        const {
          data: { user },
          error: userErr
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userErr || !user) {
          setReady(true);
          return;
        }

        const fk = SITTER_PROFILES_USER_COLUMN;
        const { data: row, error: fetchErr } = await supabase
          .from(SITTER_PROFILES_TABLE)
          .select(`full_name, bio, years_experience, hourly_rate_nis, ${fk}`)
          .eq(fk, user.id)
          .maybeSingle();

        if (cancelled) return;

        if (fetchErr) {
          const msg = fetchErr.message?.toLowerCase() ?? "";
          if (msg.includes("failed to fetch") || msg.includes("network")) {
            setLoadHint("אין חיבור רשת — אפשר לערוך ולשמור כשהחיבור יחזור.");
          }
          setReady(true);
          return;
        }

        if (row && typeof row === "object") {
          const r = row as Record<string, unknown>;
          if (typeof r.full_name === "string") setFullName(r.full_name);
          if (typeof r.bio === "string") setBio(r.bio);
          if (r.years_experience != null && r.years_experience !== "") {
            setYearsExperience(String(r.years_experience));
          }
          if (r.hourly_rate_nis != null && r.hourly_rate_nis !== "") {
            setHourlyRateNis(String(r.hourly_rate_nis));
          }
        }
      } catch {
        if (!cancelled) setLoadHint("טעינת הפרופיל נכשלה; אפשר לנסות שמירה בכל זאת.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    setSaveWarning(null);
    setSavedOk(false);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSaveWarning("Supabase לא מוגדר.");
      return;
    }

    setBusy(true);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setSaveWarning("יש להתחבר כדי לשמור.");
        return;
      }

      const years =
        yearsExperience.trim() === "" ? null : Math.max(0, parseInt(yearsExperience.replace(/\D/g, ""), 10) || 0);
      const rate =
        hourlyRateNis.trim() === "" ? null : Math.max(0, Number(hourlyRateNis.replace(/[^\d.]/g, "")) || 0);

      const profileFields = {
        full_name: fullName.trim() || null,
        bio: bio.trim() || null,
        years_experience: years,
        hourly_rate_nis: rate
      };

      const complete = isSitterProfileComplete({ ...profileFields, id: user.id });
      if (!complete) {
        setSaveWarning("יש למלא את כל השדות לפני סיום ההרשמה.");
        return;
      }

      const now = new Date().toISOString();
      const fk = SITTER_PROFILES_USER_COLUMN;
      const row: Record<string, unknown> = {
        [fk]: user.id,
        ...profileFields,
        updated_at: now,
        onboarding_completed_at: now,
        is_public: true
      };

      const { error } = await supabase.from(SITTER_PROFILES_TABLE).upsert(row, { onConflict: fk });

      if (error) {
        setSaveWarning(error.message || "שמירת הפרופיל נכשלה — הדשבורד זמין.");
        return;
      }

      setSavedOk(true);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(SITTER_PROFILE_SAVED_NAV_FLAG, "1");
        } catch {
          /* ignore */
        }
      }
      onSaved?.();
      const onDashboard =
        typeof window !== "undefined" && window.location.pathname.startsWith("/sitter/dashboard");
      if (onDashboard) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        router.refresh();
      } else {
        router.push("/sitter/dashboard");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-[8rem] space-y-2 animate-pulse rounded-xl border border-navy-header/10 bg-slate-50/80 p-4" aria-busy="true">
        <div className="h-3 w-1/3 rounded bg-slate-200" />
        <div className="h-10 w-full rounded-lg bg-slate-200" />
        <p className="text-center text-xs text-slate-500">טוען…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl" suppressHydrationWarning>
      {loadHint ? (
        <p className="rounded-lg bg-amber-50 p-2 text-center text-xs text-amber-950">{loadHint}</p>
      ) : null}
      {saveWarning ? (
        <p className="rounded-lg border border-amber-200/80 bg-amber-50/90 p-2 text-center text-xs text-amber-950">
          {saveWarning}
        </p>
      ) : null}
      {savedOk ? (
        <div className="space-y-1 rounded-lg bg-emerald-50 p-2 text-center">
          <p className="text-xs font-medium text-emerald-900">נשמר.</p>
          <p className="text-[0.7rem] text-emerald-800/90">המזהה האישי יופיע בראש הדשבורד.</p>
        </div>
      ) : null}

      <form
        className="space-y-3"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        suppressHydrationWarning
      >
        <label className="block text-sm text-navy-900">
          שם מלא
          <input
            name="full_name"
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={busy}
            suppressHydrationWarning
          />
        </label>
        <label className="block text-sm text-navy-900">
          שנות ניסיון
          <input
            name="years_experience"
            className={inputClass}
            inputMode="numeric"
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value.replace(/\D/g, "").slice(0, 2))}
            disabled={busy}
            suppressHydrationWarning
          />
        </label>
        <label className="block text-sm text-navy-900">
          ביוגרפיה קצרה
          <textarea
            name="bio"
            className={`${inputClass} min-h-[5rem]`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            disabled={busy}
            suppressHydrationWarning
          />
        </label>
        <label className="block text-sm text-navy-900">
          תעריף שעתי (₪)
          <input
            name="hourly_rate_nis"
            className={inputClass}
            inputMode="decimal"
            dir="ltr"
            value={hourlyRateNis}
            onChange={(e) => setHourlyRateNis(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))}
            disabled={busy}
            suppressHydrationWarning
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full flex-row-reverse items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              שומרים…
            </>
          ) : (
            "סיום והמשך לדשבורד"
          )}
        </button>
      </form>
    </div>
  );
}
