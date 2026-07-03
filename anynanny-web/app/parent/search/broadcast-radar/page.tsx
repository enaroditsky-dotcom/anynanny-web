"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MainLayout } from "@components/layout/MainLayout";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Zap, ShieldCheck, Star, Clock, AlertCircle, RefreshCw, ArrowRight, XCircle } from "lucide-react";

interface RespondingSitter {
  id: string;
  name: string;
  rating: number;
  experience: number;
  hourlyRate: number;
}

export default function BroadcastRadarPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const searchParams = useSearchParams();
  
  // חילוץ המזהים מה-URL
  const alertId = searchParams.get("alertId");
  const city = searchParams.get("city") || "חיפה";
  const type = searchParams.get("type") || "sitter";

  const [responders, setResponders] = useState<RespondingSitter[]>([]);
  const [dots, setDots] = useState(".");
  const [isExpired, setIsExpired] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // אנימציית נקודות קטנה לטעינה
  useEffect(() => {
    if (isExpired) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [isExpired]);

  // 1. האזנה בזמן אמת לשינוי הסטטוס של השידור עצמו (זיהוי פג תוקף או ביטול)
  useEffect(() => {
    if (!alertId || alertId === "null") return;

    const alertChannel = supabase
      .channel(`alert_status:${alertId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "broadcasts", // 🔥 סנכרון שם הטבלה המדויק שלך מבוסס ה-Table Editor
          filter: `id=eq.${alertId}`
        },
        (payload) => {
          console.log("Base alert updated in DB:", payload.new);
          if (payload.new.status === "expired" || payload.new.status === "cancelled") {
            setIsExpired(true);
          }
        }
      )
      .subscribe();

    // בדיקה ראשונית של הסטטוס הנוכחי למקרה שההורה רענן את העמוד
    const checkCurrentStatus = async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("status, created_at")
        .eq("id", alertId)
        .maybeSingle();
      
      if (data?.status === "expired" || data?.status === "cancelled") {
        setIsExpired(true);
      } else if (data?.created_at) {
        // הגנה לוקאלית: אם עברו יותר מ-20 דקות מרגע היצירה, נחשיב כפג תוקף
        const minutesPassed = (Date.now() - new Date(data.created_at).getTime()) / 1000 / 60;
        if (minutesPassed >= 20) {
          setIsExpired(true);
          await supabase.from("broadcasts").update({ status: "expired" }).eq("id", alertId);
        }
      }
    };
    
    void checkCurrentStatus();

    return () => {
      supabase.removeChannel(alertChannel);
    };
  }, [alertId, supabase]);

  // 2. האזנה בזמן אמת (Realtime) לתגובות של נניז
  useEffect(() => {
    if (!alertId || alertId === "null" || isExpired) return;

    console.log(`📡 Parent initialising Realtime channel for alert ID: ${alertId}`);

    const channel = supabase
      .channel(`radar:${alertId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "broadcast_responses",
          filter: `alert_id=eq.${alertId}`
        },
        async (payload) => {
          console.log("⚡ New response row detected in database!", payload.new);
          const sitterId = payload.new.sitter_id;
          
          try {
            const { data: sitterProfile, error: profileError } = await supabase
              .from("sitter_profiles") 
              .select("full_name, hourly_rate_nis, years_experience")
              .eq("id", sitterId)
              .maybeSingle();

            if (profileError) {
              console.error("❌ Supabase error fetching sitter profile:", profileError);
              return;
            }

            if (!sitterProfile) {
              setResponders((prev) => {
                if (prev.some((r) => r.id === sitterId)) return prev;
                return [
                  ...prev,
                  {
                    id: sitterId,
                    name: "מטפלת זמינה בסביבה",
                    rating: 5.0,
                    experience: 3,
                    hourlyRate: 60
                  }
                ];
              });
              return;
            }

            setResponders((prev) => {
              if (prev.some((r) => r.id === sitterId)) return prev;
              return [
                ...prev,
                {
                  id: sitterId,
                  name: sitterProfile.full_name || "נני במערכת",
                  rating: 5.0, 
                  experience: sitterProfile.years_experience ?? 0,
                  hourlyRate: sitterProfile.hourly_rate_nis ?? 50
                }
              ];
            });
          } catch (catchErr) {
            console.error("❌ Catch error in realtime payload processing:", catchErr);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alertId, isExpired, supabase]);

  // 🔥 פונקציית ביטול ועצירה ידנית מובנית
  const handleCancelBroadcast = async () => {
    if (!alertId || isCancelling) return;

    setIsCancelling(true);
    try {
      const response = await fetch("/api/broadcast/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcastId: alertId }),
      });

      if (!response.ok) {
        throw new Error("Failed to cancel broadcast via API");
      }

      router.push("/parent/search");
    } catch (err) {
      console.error("❌ Error stopping broadcast:", err);
      alert("תקלה בעצירת השידור, נסה שנית.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSelectSitter = async (sitter: RespondingSitter) => {
    if (!alertId || alertId === "null") {
      alert("מזהה שידור חסר. לא ניתן להשלים את ההזמנה.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("שגיאת הזדהות. אנא התחבר מחדש.");
        return;
      }

      await supabase
        .from("broadcasts")
        .update({ status: "filled" })
        .eq("id", alertId);

      const now = new Date();
      const bookingDateStr = now.toISOString();
      const startTimeStr = now.toISOString();
      const endTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const endTimeStr = endTime.toISOString();

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

      alert(`מזל טוב! סגרת משמרת מיידית מול ${sitter.name}. המשמרת תואמה בהצלחה.`);
      router.push("/parent/dashboard");

    } catch (err) {
      console.error("❌ Error completing booking flow:", err);
      alert("תקלה בתהליך סגירת המשמרת. בדוק את ה-Console.");
    }
  };

  const serviceLabel = type === "lactation" ? "יועצת הנקה" : type === "sleep" ? "יועצת שינה" : "בייביסיטר";

  // חיווי אם מזהה השידור לא קיים בכלל ב-URL
  if (!alertId && errorStatus === "missing_id") {
    return (
      <MainLayout>
        <div dir="rtl" className="mx-auto max-w-md p-6 text-center space-y-3">
          <p className="text-sm font-bold text-slate-700">לא נמצא מזהה שידור פעיל.</p>
          <button 
            onClick={() => router.push("/parent/search")}
            className="text-xs bg-navy-header text-white px-4 py-2 rounded-xl font-bold shadow-sm"
          >
            חזור לדף החיפוש
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-md space-y-6 pt-4 px-2">
        
        {/* תצוגת פג תוקף או ביטול: מופעלת אם השידור נסגר ללא מענה או בוטל */}
        {isExpired && responders.length === 0 ? (
          <div className="rounded-3xl bg-white p-6 border border-slate-100 shadow-soft text-center space-y-4 animate-fadeIn">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 shadow-inner">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-black text-navy-header">החיפוש הופסק או פג תוקף</h1>
              <p className="text-xs text-slate-500 font-medium px-4 leading-relaxed">
                השידור המיידי לאזור {city} נעצר בהצלחה או עבר את הגבלת הזמן של 20 דקות ללא מענה זמין מעכשיו לעכשיו.
              </p>
            </div>
            
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => router.push("/parent/search")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-navy-header px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#001F3F]/90 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                הפעל שידור חדש
              </button>
              <button
                type="button"
                onClick={() => router.push("/parent/search?mode=normal")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
              >
                מעבר לחיפוש רגיל בלוח
                <ArrowRight className="h-3.5 w-3.5 rotate-120" />
              </button>
            </div>
          </div>
        ) : (
          /* תצוגת הראדאר הרגילה כשהשידור פעיל */
          <>
            <div className="rounded-3xl bg-gradient-to-br from-[#FFF5F5] to-[#FFF0F0] p-5 border border-[#FF8A8A]/20 shadow-sm text-center space-y-3 relative overflow-hidden">
              <div className="absolute -left-4 -top-4 text-[#FF8A8A]/10 transform -rotate-12">
                <Zap className="h-24 w-24 fill-current" />
              </div>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FF8A8A] text-white shadow-md">
                <Zap className="h-6 w-6 fill-white" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-black text-navy-header">השידור המיידי הופעל ב{city}</h1>
                <p className="text-xs text-slate-500 font-medium">מחפשים עבורך {serviceLabel} מעכשיו לעכשיו</p>
              </div>
              <div className="flex items-center justify-center gap-1.5 pt-1 text-sm font-bold text-[#FF8A8A]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF8A8A] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF8A8A]"></span>
                </span>
                <span>נניז בסביבה מקבלות התראה כעת{dots}</span>
              </div>

              {/* 🔥 כפתור ביטול ה-Broadcast המובנה החדש המותאם לעיצוב */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={handleCancelBroadcast}
                  className="mx-auto flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white/90 px-4 py-2 text-xs font-bold text-rose-600 shadow-xs transition hover:bg-rose-50 active:scale-[0.98] disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>{isCancelling ? "מבטל..." : "עצור חיפוש וביטול קריאה"}</span>
                </button>
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
                      className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-white shadow-soft"
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
                <p className="text-[10px] text-slate-500 leading-normal">כל הנניז הרשומות בפלטפורמה עברו אימות פרופיל קשיח ובדיקת רקע. הבחירה שלך בטוחה לחלוטין.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}