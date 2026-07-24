"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MessageSquare, Calendar, ArrowRight } from "lucide-react";
import { getSitterProfilesTable, formatSitterDisplayName } from "@/lib/sitter/sitter-profile";

export default function ParentSitterProfileView() {
  const router = useRouter();
  const params = useParams();
  const sitterId = typeof params?.sitterId === "string" ? params.sitterId : "";
  const { isLoading, signedIn, effectiveRole } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!signedIn) {
      router.replace(`/auth/login?next=/parent/sitter/${sitterId}`);
      return;
    }
    if (effectiveRole === "sitter") {
      router.replace("/sitter/dashboard");
    }
  }, [isLoading, signedIn, effectiveRole, sitterId, router]);

  useEffect(() => {
    async function loadSitter() {
      if (!sitterId) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setErrorMsg("Supabase לא מוגדר.");
        setFetching(false);
        return;
      }

      try {
        const tableName = getSitterProfilesTable();
        
        let { data, error } = await supabase
          .from(tableName)
          .select("*")
          .eq("id", sitterId)
          .maybeSingle();

        if (!data) {
          const res = await supabase
            .from(tableName)
            .select("*")
            .eq("user_id", sitterId)
            .maybeSingle();
          data = res.data;
          error = res.error;
        }

        if (error || !data) {
          setErrorMsg("הפרופיל אינו נמצא.");
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch (err) {
        setErrorMsg("שגיאה בטעינת הפרופיל.");
      } finally {
        setFetching(false);
      }
    }

    if (signedIn && effectiveRole === "parent") {
      void loadSitter();
    }
  }, [sitterId, signedIn, effectiveRole]);

  const displayName = formatSitterDisplayName(profile) || profile?.display_name || "בייביסיטר";
  const workingCity = profile?.working_cities?.[0] || "חיפה";
  const rateValue = profile?.hourly_rate_nis;
  const serialDisplay = profile?.nanny_serial || profile?.id;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-4 pb-24 px-2" dir="rtl">
      <div className="px-1">
        <Link
          href="/parent/search/results"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#001F3F] transition hover:opacity-80"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לחיפוש
        </Link>
      </div>

      {fetching ? (
        <p className="text-right text-sm text-slate-600 px-1">טוען פרופיל…</p>
      ) : errorMsg ? (
        <p className="text-right text-sm text-rose-700 px-1">{errorMsg}</p>
      ) : profile ? (
        <div className="rounded-3xl border border-navy-header/12 bg-white p-5 shadow-soft space-y-4">
          <div className="text-right space-y-1">
            <h1 className="text-xl font-bold text-[#001F3F]">{displayName}</h1>
            {serialDisplay && (
              <p className="text-xs font-semibold text-violet-600">מזהה: {serialDisplay}</p>
            )}
            <div className="flex items-center gap-1 text-xs text-slate-600 pt-1" dir="rtl">
              <span className="font-semibold text-slate-700">
                {profile.years_experience ? `${profile.years_experience} שנות ניסיון` : "ניסיון לא צוין"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-600" dir="rtl">
              <span className="font-semibold text-slate-700">אזור עבודה:</span>
              <span>{workingCity}</span>
            </div>
            <p className="text-xs text-violet-700 font-medium">
              {profile.has_car ? "דרך הגעה: עצמאית" : "דרך הגעה: תחבורה ציבורית"}
            </p>
            <p className="text-sm font-semibold text-navy-800 pt-1">
              {rateValue != null ? `${rateValue} ₪ / שעה` : "מחיר לא צוין"}
            </p>
          </div>

          <div className="border-t border-slate-100 pt-3 text-right">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">אודות</h2>
            <p className="mt-1 text-sm text-slate-700">{profile.bio || "אין פירוט זמין"}</p>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider text-right">פעולות</h2>
            <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 p-3 bg-slate-50/50">
              <div className="text-right">
                <p className="text-sm font-bold text-[#001F3F]">שלח הודעה</p>
                <p className="text-xs text-slate-500">שיחה פרטית — הבייביסיטר תקבל התראה</p>
              </div>
              <MessageSquare className="h-5 w-5 text-slate-600" />
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-[#001F3F] p-3 text-white">
              <div className="text-right">
                <p className="text-sm font-bold">תיאום משמרת</p>
                <p className="text-xs text-slate-200">בחרו תאריך ושעות — הבקשה תישלח לאישור</p>
              </div>
              <Calendar className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}