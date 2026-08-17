'use client';
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  coalesceSignupNames,
  hasCompleteSignupNames,
  namesFromUserMetadata,
  readSignupNamesFromDevice,
  saveSignupNamesToDevice
} from "@/lib/auth/signup-names";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import {
  ensureSitterProfileRowForUser,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";

export default function SitterOnboardingForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    yearsExperience: 0,
    hourlyRateNis: 0,
    hasCar: false
  });
  const [namesReady, setNamesReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        const cached = readSignupNamesFromDevice();
        if (cached) {
          setFormData((prev) => ({
            ...prev,
            firstName: cached.first_name,
            lastName: cached.last_name
          }));
          setNamesReady(true);
        }
        return;
      }
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        const cached = readSignupNamesFromDevice();
        if (cached) {
          setFormData((prev) => ({
            ...prev,
            firstName: cached.first_name,
            lastName: cached.last_name
          }));
          setNamesReady(true);
        }
        return;
      }

      const [{ data: sitterRow }, { data: profileRow }] = await Promise.all([
        supabase
          .from(SITTER_PROFILES_TABLE)
          .select("first_name, last_name")
          .eq(SITTER_PROFILES_USER_COLUMN, user.id)
          .maybeSingle(),
        supabase.from(PROFILES_TABLE).select("first_name, last_name").eq("id", user.id).maybeSingle()
      ]);

      const resolved = coalesceSignupNames(
        sitterRow,
        profileRow,
        namesFromUserMetadata(user.user_metadata as Record<string, unknown> | undefined),
        readSignupNamesFromDevice()
      );

      if (resolved.first_name || resolved.last_name) {
        setFormData((prev) => ({
          ...prev,
          firstName: resolved.first_name || prev.firstName,
          lastName: resolved.last_name || prev.lastName
        }));
      }
      if (hasCompleteSignupNames(resolved)) {
        setNamesReady(true);
        saveSignupNamesToDevice(resolved);
        if (sitterRow) {
          await ensureSitterProfileRowForUser(supabase, user.id, resolved);
        }
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!formData.firstName.trim() || !formData.lastName.trim()) return;
    setSaving(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      router.push("/sitter/dashboard");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      await ensureSitterProfileRowForUser(supabase, user.id, {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim()
      });

      await supabase
        .from(SITTER_PROFILES_TABLE)
        .update({
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          years_experience: Math.max(0, Math.floor(formData.yearsExperience)),
          hourly_rate_nis: Math.max(0, Math.round(formData.hourlyRateNis)),
          has_car: Boolean(formData.hasCar),
          updated_at: new Date().toISOString()
        })
        .eq(SITTER_PROFILES_USER_COLUMN, user.id);

    } catch (err) {
      console.error("[sitter onboarding] Save error:", err);
    } finally {
      setSaving(false);
      router.push("/sitter/dashboard");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 max-w-sm mx-auto" dir="rtl">
      <h1 className="text-2xl font-bold mb-2 text-[#001F3F]">הרשמת מטפלת</h1>
      
      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
        בואי נכיר טוב יותר ונבנה פרופיל בולט ואטרקטיבי שיגרום להורים לבחור בך בקלות!
      </p>
      
      <div className="space-y-4">
        {namesReady ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-right">
            <p className="text-[13px] font-semibold text-slate-500">שלום</p>
            <p className="mt-0.5 text-sm font-bold text-[#001F3F]">
              {formData.firstName} {formData.lastName}
            </p>
            <p className="mt-1 text-[13px] text-slate-500">השם נשמר מההרשמה ואין צורך להקליד שוב</p>
          </div>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            טוען את השם מההרשמה…
          </p>
        )}
        
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">שנות ניסיון</label>
          <input type="number" min={0} placeholder="שנות ניסיון" className="block w-full p-2.5 border rounded-xl bg-slate-50/50" value={formData.yearsExperience} onChange={(e) => setFormData({...formData, yearsExperience: Number(e.target.value)})} required />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">תעריף שעתי (₪)</label>
          <input type="number" min={0} placeholder="תעריף שעתי (₪)" className="block w-full p-2.5 border rounded-xl bg-slate-50/50" value={formData.hourlyRateNis} onChange={(e) => setFormData({...formData, hourlyRateNis: Number(e.target.value)})} required />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 pt-2 cursor-pointer">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked={formData.hasCar} onChange={(e) => setFormData({...formData, hasCar: e.target.checked})} />
          יש לי רכב / הגעה עצמאית
        </label>
      </div>

      <button type="submit" disabled={saving || !namesReady} className="w-full mt-6 rounded-xl bg-emerald-700 p-3 text-white font-medium transition hover:bg-emerald-800 disabled:opacity-60 shadow-sm">
        {saving ? "שומרים..." : "סיום"}
      </button>
    </form>
  );
}
