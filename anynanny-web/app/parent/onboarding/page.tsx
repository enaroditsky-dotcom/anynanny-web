"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { USER_SPECIAL_OCCASIONS_TABLE } from "@/lib/parent/user-special-occasions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type OccasionDraft = { event_name: string; event_date: string };

export default function ParentOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [occasions, setOccasions] = useState<OccasionDraft[]>([{ event_name: "", event_date: "" }]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        if (!cancelled) router.replace("/auth/login?next=/parent/onboarding");
        return;
      }
      const first = await supabase
        .from(PROFILES_TABLE)
        .select("role, parent_onboarding_completed_at")
        .eq("id", user.id)
        .maybeSingle();
      let profile = first.data;
      if (
        first.error &&
        isPostgrestMissingColumnError(first.error.message, "parent_onboarding_completed_at")
      ) {
        const second = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
        if (second.error) {
          if (!cancelled) setLoading(false);
          return;
        }
        profile =
          second.data !== null && second.data !== undefined
            ? { ...second.data, parent_onboarding_completed_at: null as string | null }
            : null;
      } else if (first.error) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (cancelled) return;
      if (profile?.role !== "parent") {
        router.replace("/parent/dashboard");
        return;
      }
      if (profile?.parent_onboarding_completed_at) {
        router.replace("/parent/dashboard");
        return;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const addRow = () => setOccasions((rows) => [...rows, { event_name: "", event_date: "" }]);
  const removeRow = (i: number) => setOccasions((rows) => rows.filter((_, j) => j !== i));
  const patchRow = (i: number, patch: Partial<OccasionDraft>) =>
    setOccasions((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const skipFinish = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    setMessage("");
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login?next=/parent/onboarding");
        return;
      }
      const iso = new Date().toISOString();
      let up = await supabase
        .from(PROFILES_TABLE)
        .update({ parent_onboarding_completed_at: iso, updated_at: iso })
        .eq("id", user.id);
      if (
        up.error &&
        isPostgrestMissingColumnError(up.error.message, "parent_onboarding_completed_at")
      ) {
        up = await supabase.from(PROFILES_TABLE).update({ updated_at: iso }).eq("id", user.id);
      }
      if (up.error) {
        setMessage(up.error.message);
        return;
      }
    } finally {
      setSaving(false);
    }
  }, [router]);

  const finish = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    setMessage("");
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login?next=/parent/onboarding");
        return;
      }

      const filled = occasions.filter((o) => o.event_name.trim() && o.event_date);
      const partial = occasions.some((o) => (o.event_name.trim() && !o.event_date) || (!o.event_name.trim() && o.event_date));
      if (partial) {
        setMessage("לכל אירוע יש למלא שם ותאריך, או למחוק את השורה.");
        return;
      }

      const { error: delErr } = await supabase.from(USER_SPECIAL_OCCASIONS_TABLE).delete().eq("user_id", user.id);
      if (delErr) {
        setMessage(delErr.message);
        return;
      }
      if (filled.length > 0) {
        const { error: insErr } = await supabase.from(USER_SPECIAL_OCCASIONS_TABLE).insert(
          filled.map((o) => ({
            user_id: user.id,
            event_name: o.event_name.trim(),
            event_date: o.event_date
          }))
        );
        if (insErr) {
          setMessage(insErr.message);
          return;
        }
      }

      const iso = new Date().toISOString();
      let up = await supabase
        .from(PROFILES_TABLE)
        .update({ parent_onboarding_completed_at: iso, updated_at: iso })
        .eq("id", user.id);
      if (
        up.error &&
        isPostgrestMissingColumnError(up.error.message, "parent_onboarding_completed_at")
      ) {
        up = await supabase.from(PROFILES_TABLE).update({ updated_at: iso }).eq("id", user.id);
      }
      if (up.error) {
        setMessage(up.error.message);
        return;
      }

      router.push("/parent/dashboard");
    } finally {
      setSaving(false);
    }
  }, [occasions, router]);

  if (loading) {
    return (
      <main className="mx-auto max-w-md py-16 text-center text-sm text-slate-600" dir="rtl">
        טוען…
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8" dir="rtl">
      <h1 className="text-2xl font-bold text-navy-header">ברוכים הבאים</h1>
      <p className="mt-2 text-sm text-slate-600">
        שלב אופציונלי: רגעים מיוחדים (ימי הולדת, חגים) — עוזר לבייביסיטר להתכונן. אפשר לדלג.
      </p>

      <section className="mt-8 space-y-4 rounded-2xl border border-navy-header/10 bg-white p-4 shadow-soft">
        <h2 className="text-sm font-semibold text-navy-header">רגעים מיוחדים (אופציונלי)</h2>
        {occasions.map((row, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs font-medium text-navy-900">
              שם האירוע
              <input
                className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2 text-sm"
                value={row.event_name}
                onChange={(e) => patchRow(i, { event_name: e.target.value })}
                disabled={saving}
              />
            </label>
            <label className="w-full text-xs font-medium text-navy-900 sm:w-40">
              תאריך
              <input
                type="date"
                className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2 text-sm"
                value={row.event_date}
                onChange={(e) => patchRow(i, { event_date: e.target.value })}
                disabled={saving}
              />
            </label>
            <button
              type="button"
              aria-label="מחיקת שורה"
              onClick={() => removeRow(i)}
              disabled={saving || occasions.length <= 1}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-600 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          disabled={saving}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"
        >
          <Plus className="h-4 w-4" />
          הוספת אירוע
        </button>
      </section>

      {message ? <p className="mt-4 text-sm text-rose-700">{message}</p> : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
        <button
          type="button"
          disabled={saving}
          onClick={() => void finish()}
          className="rounded-2xl bg-[#001F3F] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "שומרים…" : "סיום והמשך לדשבורד"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void skipFinish()}
          className="rounded-2xl border border-navy-header/20 px-6 py-3 text-sm font-semibold text-navy-header disabled:opacity-60"
        >
          דילוג (ללא אירועים)
        </button>
      </div>
    </main>
  );
}
