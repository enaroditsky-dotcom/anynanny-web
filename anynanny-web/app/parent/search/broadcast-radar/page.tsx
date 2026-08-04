"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MainLayout } from "@components/layout/MainLayout";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { Zap, ShieldCheck, Star, Clock, AlertCircle, RefreshCw, PauseCircle } from "lucide-react";

export const dynamic = "force-dynamic";

interface RespondingSitter {
  id: string;
  name: string;
  rating: number;
  experience: number;
  hourlyRate: number;
}

function BroadcastRadarContent() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const searchParams = useSearchParams();
  
  const alertId = searchParams.get("alertId");
  const rawCity = searchParams.get("city") || "חיפה";
  const city = decodeURIComponent(rawCity);
  const type = searchParams.get("type") || "sitter";

  const [responders, setResponders] = useState<RespondingSitter[]>([]);
  const [dots, setDots] = useState(".");
  const [isExpired, setIsExpired] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (isExpired || isPaused) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [isExpired, isPaused]);

  // 1. האזנה לשינוי סטטוס השידור
  useEffect(() => {
    if (!alertId || alertId === "null" || !supabase) return;

    const alertChannel = subscribePostgresChanges(supabase, `alert_status-${alertId}`, {
      event: "UPDATE",
      table: "broadcast_alerts",
      filter: `id=eq.${alertId}`,
      handler: (payload) => {
        const next = payload.new as { status?: string };
        if (next.status === "expired" || next.status === "cancelled") {
          setIsExpired(true);
        } else if (next.status === "paused") {
          setIsPaused(true);
        }
      }
    });

    const checkCurrentStatus = async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from("broadcast_alerts")
        .select("status, created_at")
        .eq("id", alertId)
        .maybeSingle();
      
      if (data?.status === "expired" || data?.status === "cancelled") {
        setIsExpired(true);
      } else if (data?.status === "paused") {
        setIsPaused(true);
      }
    };
    
    void checkCurrentStatus();

    return () => {
      if (supabase) {
        removeRealtimeChannel(supabase, alertChannel);
      }
    };
  }, [alertId, supabase]);

  // הוספת נני לרשימה בצורה מיידית ובטוחה
  const addSitterToResponders = async (sitterId: string) => {
    if (!sitterId || !supabase) return;
    try {
      const [{ data: nameRow }, { data: sitterProfile }] = await Promise.all([
        supabase.from("profiles").select("first_name, last_name").eq("id", sitterId).maybeSingle(),
        supabase.from("sitter_profiles").select("hourly_rate_nis, years_experience").eq("id", sitterId).maybeSingle()
      ]);

      const displayName = `${nameRow?.first_name ?? ""} ${nameRow?.last_name ?? ""}`.trim() || "נני זמינה";

      setResponders((prev) => {
        if (prev.some((r) => r.id === sitterId)) return prev;
        return [
          ...prev,
          {
            id: sitterId,
            name: displayName,
            rating: 5.0,
            experience: sitterProfile?.years_experience ?? 3,
            hourlyRate: sitterProfile?.hourly_rate_nis ?? 60
          }
        ];
      });
    } catch (err) {
      console.error("Error loading sitter details:", err);
    }
  };

  // 2. שליפה ראשונית ופולינג מהיר כל שנייה אחת כך שההורה יקבל פידבק מיידי
  useEffect(() => {
    if (!alertId || alertId === "null" || isExpired || !supabase) return;

    const fetchResponses = async () => {
      if (!supabase) return;
      const { data: existingResponses } = await supabase
        .from("broadcast_responses")
        .select("sitter_id")
        .eq("alert_id", alertId);

      if (existingResponses && existingResponses.length > 0) {
        for (const resp of existingResponses) {
          if (resp.sitter_id) {
            await addSitterToResponders(resp.sitter_id);
          }
        }
      }
    };

    void fetchResponses();

    const pollInterval = setInterval(() => {
      void fetchResponses();
    }, 1000);

    const channel = subscribePostgresChanges(supabase, `radar-${alertId}`, {
      event: "INSERT",
      table: "broadcast_responses",
      filter: `alert_id=eq.${alertId}`,
      handler: async (payload) => {
        const next = payload.new as { sitter_id?: string };
        if (next?.sitter_id) {
          await addSitterToResponders(next.sitter_id);
        }
      }
    });

    return () => {
      clearInterval(pollInterval);
      if (supabase) {
        removeRealtimeChannel(supabase, channel);
      }
    };
  }, [alertId, isExpired, supabase]);

  const handlePauseBroadcast = async () => {
    if (!alertId || isCancelling || !supabase) return;

    setIsCancelling(true);
    try {
      await supabase.from("broadcast_alerts").update({ status: "paused" }).eq("id", alertId);
      setIsPaused(true);
    } catch (err) {
      alert("תקלה בעצירת החיפוש, נסה שנית.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSelectSitter = async (sitter: RespondingSitter) => {
    if (!alertId || alertId === "null" || !supabase) {
      alert("מזהה שידור חסר. לא ניתן להשלים את ההזמנה.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("שגיאת הזדהות. אנא התחבר מחדש.");
        return;
      }

      // 1. עדכון סטטוס השידור ל-filled
      await supabase
        .from("broadcast_alerts")
        .update({ status: "filled" })
        .eq("id", alertId);

      // 2. יצירת נתוני זמן בפורמט ISO תקין לחלוטין ל-Supabase
      const now = new Date();
      const bookingDateStr = now.toISOString();
      const startTimeStr = now.toISOString();
      const endTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const endTimeStr = endTime.toISOString();

      // 3. הוספת ה-Booking לטבלה
      const { error: bookingError } = await supabase
        .from("bookings")
        .insert([
          {
            parent_id: user.id,
            sitter_id: sitter.id,
            booking_date: bookingDateStr,
            start_time: startTimeStr,
            end_time: endTimeStr
          }
        ]);

      if (bookingError) throw bookingError;

      // 4. יצירה או מציאה של צ'אט משותף
      const { data: existingChat } = await supabase
        .from("chats")
        .select("id")
        .eq("parent_id", user.id)
        .eq("sitter_id", sitter.id)
        .maybeSingle();

      if (!existingChat) {
        await supabase
          .from("chats")
          .insert([{ parent_id: user.id, sitter_id: sitter.id }]);
      }

      alert(`מזל טוב! סגרת משמרת מיידית מול ${sitter.name}. המשמרת תואמה בהצלחה.`);
      router.push("/parent/dashboard");

    } catch (err) {
      console.error("❌ Error completing booking flow:", err);
      alert("תקלה בתהליך סגירת המשמרת.");
    }
  };

  const serviceLabel = type === "lactation" ? "יועצת הנקה" : type === "sleep" ? "יועצת שינה" : type === "doula" ? "דולה" : "בייביסיטר";

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-6 pt-4 px-2">
      {isExpired && responders.length === 0 ? (
        <div className="rounded-3xl bg-white p-6 border border-slate-100 shadow-soft text-center space-y-4 animate-fadeIn">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 shadow-inner">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-black text-navy-header">החיפוש הופסק או פג תוקף</h1>
            <p className="text-xs text-slate-500 font-medium px-4 leading-relaxed">
              השידור המיידי לאזור {city} נעצר.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push("/parent/search")}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-navy-header px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#001F3F]/90 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              הפעילו שידור חדש
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-gradient-to-br from-[#FFF5F5] to-[#FFF0F0] p-5 border border-[#FF8A8A]/20 shadow-sm text-center space-y-3 relative overflow-hidden">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FF8A8A] text-white shadow-md">
              <Zap className="h-6 w-6 fill-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-black text-navy-header">
                {isPaused ? `החיפוש הושהה ב-${city}` : `השידור המיידי הופעל ב-${city}`}
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {isPaused ? "התוצאות נשמרו לפניך - בחר את המטפלת המועדפת" : `מחפשים עבורך ${serviceLabel} מעכשיו לעכשיו`}
              </p>
            </div>

            {!isPaused ? (
              <div className="flex items-center justify-center gap-1.5 pt-1 text-sm font-bold text-[#FF8A8A]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF8A8A] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF8A8A]"></span>
                </span>
                <span>נניז בסביבה מקבלות התראה כעת{dots}</span>
              </div>
            ) : null}

            <div className="pt-2">
              {!isPaused ? (
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={handlePauseBroadcast}
                  className="mx-auto flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white/90 px-4 py-2 text-xs font-bold text-amber-700 shadow-xs transition hover:bg-amber-50 active:scale-[0.98] disabled:opacity-50"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  <span>{isCancelling ? "עוצר חיפוש..." : "עצור חיפוש ושמור תוצאות"}</span>
                </button>
              ) : (
                <span className="inline-block text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  ✓ החיפוש נעצר, הרשימה לפניך לבחירה
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-400 mr-1 uppercase tracking-wider">
              מטפלות פנויות שהגיבו ({responders.length})
            </h2>

            {responders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center space-y-2">
                <Clock className="mx-auto h-8 w-8 text-slate-300 animate-spin" style={{ animationDuration: '3s' }} />
                <p className="text-xs font-bold text-slate-600">ממתינים לתגובה ראשונה...</p>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto">בדרך כלל לוקח לנניז בסביבה בין 1 ל-3 דקות לאשר את הקריאה בטלפון שלהן.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {responders.map((sitter) => (
                  <div 
                    key={sitter.id}
                    className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-white shadow-soft animate-fadeIn"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center font-black text-purple-700 text-sm">
                        {sitter.name[0]}
                      </div>
                      <div className="space-y-0.5 text-right">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1">
                          {sitter.name}
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md font-bold">
                            <Star className="h-2.5 w-2.5 fill-current text-amber-500" />
                            {sitter.rating}
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium">{sitter.experience} שנות ניסיון • ₪{sitter.hourlyRate}/שעה</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectSitter(sitter)}
                      className="rounded-xl bg-navy-header px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#001F3F]/90 transition"
                    >
                      בחירה וסגירה
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-start gap-2.5 text-right">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-[11px] font-bold text-slate-700">הגנה מלאה על המשמרת</h4>
              <p className="text-[10px] text-slate-500 leading-normal">כל הנניז הרשומות בפלטפורמה עברו אימות פרופיל קשיח ובדיקת רקע.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function BroadcastRadarPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="text-center py-12 text-xs text-slate-400 font-bold">טוען נתוני חיפוש...</div>}>
        <BroadcastRadarContent />
      </Suspense>
    </MainLayout>
  );
}