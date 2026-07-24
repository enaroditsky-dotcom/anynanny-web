'use client';
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";

export default function SitterOnboardingForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    yearsExperience: 0,
    hourlyRateNis: 0,
    hasCar: false
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      router.push("/sitter/dashboard");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

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
      
      {/* משפט הפתיחה המזמין */}
      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
        בואי נכיר טוב יותר ונבנה פרופיל בולט ואטרקטיבי שיגרום להורים לבחור בך בקלות!
      </p>
      
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">שם פרטי</label>
          <input type="text" placeholder="שם פרטי" className="block w-full p-2.5 border rounded-xl bg-slate-50/50" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} required />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">שם משפחה</label>
          <input type="text" placeholder="שם משפחה" className="block w-full p-2.5 border rounded-xl bg-slate-50/50" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} required />
        </div>
        
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

      <button type="submit" disabled={saving} className="w-full mt-6 rounded-xl bg-emerald-700 p-3 text-white font-medium transition hover:bg-emerald-800 disabled:opacity-60 shadow-sm">
        {saving ? "שומרים..." : "סיום"}
      </button>
    </form>
  );
}