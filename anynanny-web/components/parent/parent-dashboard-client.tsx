"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ParentOnboardingWizard } from "@/components/parent/parent-onboarding-wizard";
import type { ParentBusySlot, ParentPreferences } from "@/lib/parent/types";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Calendar, Wallet, History, LogOut, Search, Zap, CheckCircle2, Clock, Star } from "lucide-react";

export function ParentDashboardClient({
  initialPreferences,
  initialActiveBooking
}: {
  initialProfiles: any[];
  initialPreferences: ParentPreferences & { parentSerial?: string };
  initialBusySlots: ParentBusySlot[];
  initialActiveBooking?: any;
}) {
  const [prefs, setPrefs] = useState(initialPreferences);
  const [parentSerial, setParentSerial] = useState<string>(initialPreferences.parentSerial || "P-1001");
  const [profileCardStatus] = useState<"loading" | "complete" | "incomplete">("complete");
  const [activeBooking] = useState(initialActiveBooking);

  const refreshParentOnboardingStatus = useCallback(async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("first_name, last_name, parent_serial")
      .eq("id", uid)
      .maybeSingle();

    if (error) return;

    if (data?.first_name) {
      setPrefs((prev) => ({
        ...prev,
        parentName: `${data.first_name} ${data.last_name || ""}`.trim()
      }));
    }

    if (data?.parent_serial) {
      setParentSerial(data.parent_serial);
    } else {
      const { data: parentExtra } = await supabase
        .from("parent_profiles")
        .select("parent_serial")
        .eq("id", uid)
        .maybeSingle();
      
      if (parentExtra?.parent_serial) {
        setParentSerial(parentExtra.parent_serial);
      }
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) return;
      if (auth.supabase) {
        await refreshParentOnboardingStatus(auth.supabase, auth.userId);
      }
    })();
  }, [refreshParentOnboardingStatus]);

  const handleOnboardingSaved = async () => {
    window.location.reload();
  };

  const onboardingPending = profileCardStatus === "incomplete";
  const firstName = prefs.parentName ? prefs.parentName.trim().split(" ")[0] : "הורה";

  return (
    <main className="relative mx-auto max-w-md space-y-4 p-4 pb-32 overflow-y-auto min-h-screen" dir="rtl">
      {onboardingPending ? (
        <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8 bg-[#FDFBF6]/95 backdrop-blur-sm">
          <div className="w-full max-w-sm my-auto">
            <ParentOnboardingWizard onSaved={handleOnboardingSaved} />
          </div>
        </div>
      ) : null}

      <div className={`space-y-4 ${onboardingPending ? "filter blur-[3px] pointer-events-none select-none opacity-50" : ""}`}>
        
        {/* מעטפת ראשית נקייה */}
        <div className="mx-auto max-w-sm rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-4">
          
          {/* קופסה פנימית אפורה בהירה */}
          <div className="rounded-2xl bg-slate-50/70 p-4 border border-slate-100 space-y-3">
            
            {/* שורה ראשונה: שם ההורה מימין, ומזהה ID משמאל */}
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">שלום, {firstName}!</h1>
              <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[11px] font-bold px-2.5 py-0.5 rounded-md border border-purple-200" dir="ltr">
                <span>{parentSerial}</span>
                <span className="text-[9px] text-purple-500 font-normal">ID</span>
              </span>
            </div>

            {/* שורה שנייה: דירוג כוכבים בצד שמאל */}
            <div className="flex items-center justify-start">
              <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200/60 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-md">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span>0.0</span>
                <span className="text-slate-400 text-[11px]">(0 חוות דעת)</span>
              </div>
            </div>

            {/* 3 כפתורי ניווט עליונים */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Link href="/parent/calendar" className="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-3 shadow-2xs transition hover:bg-slate-50">
                <Calendar className="h-5 w-5 text-emerald-600 mb-1" />
                <span className="text-xs font-semibold text-slate-800">סידור עבודה</span>
              </Link>
              <Link href="/parent/wallet" className="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-3 shadow-2xs transition hover:bg-slate-50">
                <Wallet className="h-5 w-5 text-emerald-600 mb-1" />
                <span className="text-xs font-semibold text-slate-800">ארנק ותשלומים</span>
              </Link>
              <Link href="/parent/history" className="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-3 shadow-2xs transition hover:bg-slate-50">
                <History className="h-5 w-5 text-[#001F3F] mb-1" />
                <span className="text-xs font-semibold text-slate-800">המשמרות שלי</span>
              </Link>
            </div>
          </div>

          {/* סטטוס משמרת פעילה */}
          {activeBooking ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-center space-y-2">
              {activeBooking.status === "confirmed" || activeBooking.status === "active" ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-emerald-900">המשמרת אומתה ואושרה!</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Clock className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-amber-900">בקשה נשלחה וממתינה לאישור</p>
                </div>
              )}
            </div>
          ) : null}

          {/* כפתורי פעולה ייחודיים להורה בלבד */}
          <div className="space-y-2 pt-1">
            <Link
              href="/parent/broadcast"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-3.5 px-2 text-xs font-bold text-white shadow-md transition hover:bg-emerald-700"
            >
              <Zap className="h-4 w-4 fill-white" />
              <span>ANYNANNY NOW!</span>
            </Link>
            <Link
              href="/parent/search"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#001F3F] py-3 px-2 text-xs font-bold text-white shadow-md transition hover:bg-[#001F3F]/90"
            >
              <Search className="h-4 w-4" />
              חיפוש נני
            </Link>
          </div>

          {/* כפתורי תחתית אחידים */}
          <div className="pt-2 flex flex-col gap-2">
            <button 
              onClick={() => alert("שחרור משמרת תקופה")}
              className="w-full rounded-xl border border-amber-300 bg-amber-50/50 py-2.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 shadow-2xs"
            >
              שחרור משמרת תקופה
            </button>
            <button 
              onClick={() => {
                const supabase = getSupabaseBrowserClient();
                if (supabase) void supabase.auth.signOut().then(() => window.location.href = "/login");
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/30 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 shadow-2xs"
            >
              <LogOut className="h-4 w-4" />
              התנתקות
            </button>
          </div>

        </div>

      </div>
    </main>
  );
}