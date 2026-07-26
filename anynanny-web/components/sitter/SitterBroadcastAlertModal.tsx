"use client";

import { useEffect, useState, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { Zap, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface BroadcastAlertModalProps {
  sitterId: string;
}

export function SitterBroadcastAlertModal({ sitterId }: BroadcastAlertModalProps) {
  const router = useRouter();
  const [activeAlert, setActiveAlert] = useState<{ id: string; city: string; service_type: string } | null>(null);
  const [acceptedNotification, setAcceptedNotification] = useState<{ bookingId?: string } | null>(null);
  const [sitterCities, setSitterCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  const dismissedAlertIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!sitterId) return;
    const supabase = getSupabaseBrowserClient();
    
    async function loadSitterCities() {
      const { data, error } = await supabase
        .from("sitter_profiles")
        .select("working_cities")
        .eq("id", sitterId)
        .limit(1);

      if (error) return;
      const profile = data && data.length > 0 ? data[0] : null;
      if (profile?.working_cities && Array.isArray(profile.working_cities)) {
        setSitterCities(profile.working_cities);
      } else {
        setSitterCities(["חיפה"]);
      }
    }
    loadSitterCities();
  }, [sitterId]);

  useEffect(() => {
    if (!sitterId || sitterCities.length === 0) return;
    const supabase = getSupabaseBrowserClient();

    const playAlertSound = () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } catch (e) {
        console.log("Audio playback deferred");
      }
    };

    const checkExistingBookingsAndAlerts = async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      // Broadcast-origin column is optional (not on all schemas) — never select it or we 400.
      // Regular calendar bookings must not open the broadcast accept modal.
      const { error: recentBookingError } = await supabase
        .from("bookings")
        .select("id, created_at")
        .eq("sitter_id", sitterId)
        .gte("created_at", tenMinutesAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentBookingError) {
        console.warn("[sitter broadcast] bookings poll:", recentBookingError.message);
      }

      // שלב ב': בדיקת קריאות Broadcast פעילות
      const { data: alertsData, error } = await supabase
        .from("broadcast_alerts")
        .select("id, city, service_type, status, created_at")
        .in("city", sitterCities)
        .eq("status", "active")
        .gte("created_at", tenMinutesAgo)
        .order("created_at", { ascending: false });

      if (!error && alertsData && alertsData.length > 0) {
        const validAlert = alertsData.find(alert => !dismissedAlertIdsRef.current.has(alert.id));
        if (validAlert) {
          setActiveAlert({
            id: validAlert.id,
            city: validAlert.city,
            service_type: validAlert.service_type
          });
        } else {
          setActiveAlert(null);
        }
      } else {
        setActiveAlert(null);
      }
    };
    
    void checkExistingBookingsAndAlerts();

    const pollInterval = setInterval(() => {
      void checkExistingBookingsAndAlerts();
    }, 3000);

    const channels = sitterCities.map((city) =>
      subscribePostgresChanges(supabase, `sitter-broadcast-room-${city}`, [
        {
          event: "INSERT",
          table: "broadcast_alerts",
          filter: `city=eq.${city}`,
          handler: (payload) => {
            const next = payload.new as { id?: string; status?: string; city?: string; service_type?: string };
            if (next && next.status === "active") {
              if (next.id && !dismissedAlertIdsRef.current.has(next.id)) {
                setActiveAlert({
                  id: next.id,
                  city: next.city ?? city,
                  service_type: next.service_type ?? ""
                });
                playAlertSound();
              }
            }
          }
        },
        {
          event: "UPDATE",
          table: "broadcast_alerts",
          filter: `city=eq.${city}`,
          handler: (payload) => {
            const next = payload.new as { id?: string; status?: string };
            if (next && (next.status === "expired" || next.status === "filled" || next.status === "paused" || next.status === "cancelled")) {
              setActiveAlert(null);
            }
          }
        }
      ])
    );

    return () => {
      clearInterval(pollInterval);
      channels.forEach((channel) => removeRealtimeChannel(supabase, channel));
    };
  }, [sitterCities, sitterId]);

  const handleAccept = async () => {
    if (!activeAlert) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("שגיאת הזדהות, אנא התחבר מחדש.");
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("broadcast_responses")
        .insert([{ alert_id: activeAlert.id, sitter_id: user.id }]);

      if (error && error.code !== "23505") {
        throw error;
      } else {
        alert("אישור הזמינות נשלח בהצלחה להורה!");
      }
    } catch (err) {
      console.error("Error accepting broadcast:", err);
    } finally {
      setLoading(false);
      if (activeAlert) {
        dismissedAlertIdsRef.current.add(activeAlert.id);
      }
      setActiveAlert(null);
    }
  };

  const handleDismiss = () => {
    if (activeAlert) {
      dismissedAlertIdsRef.current.add(activeAlert.id);
    }
    setActiveAlert(null);
  };

  if (acceptedNotification) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" dir="rtl">
        <div className="w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md animate-bounce">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-800">🎉 יש לך התאמה מושלמת!</h3>
            <p className="text-xs text-slate-600">ההורה בחר בך מתוך הראדאר ויצר משמרת חדשה.</p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              if (acceptedNotification.bookingId) {
                setLoading(true);
                const supabase = getSupabaseBrowserClient();
                await supabase
                  .from("bookings")
                  .update({ status: "approved" })
                  .eq("id", acceptedNotification.bookingId);

                sessionStorage.setItem("dismissed_booking_id", acceptedNotification.bookingId);
                setLoading(false);
              }
              setAcceptedNotification(null);
              router.push("/sitter/dashboard");
              router.refresh();
            }}
            className="w-full rounded-2xl bg-emerald-600 py-3.5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? "מעדכן מערכת..." : "אישור ומעבר לדשבורד"}
          </button>
        </div>
      </div>
    );
  }

  if (!activeAlert) return null;

  const serviceName = activeAlert.service_type === "lactation" ? "יועצת הנקה" : activeAlert.service_type === "sleep" ? "יועצת שינה" : "בייביסיטר";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" dir="rtl">
      <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-md animate-pulse">
            <Zap className="h-6 w-6 fill-white" />
          </div>
          
          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-800">⚡ קריאת ברק מיידית בסביבה!</h3>
            <p className="text-xs font-semibold text-red-600">הורה ב{activeAlert.city} מחפש מענה מעכשיו לעכשיו!</p>
            <p className="text-xs text-slate-500">התפקיד הנדרש: <span className="font-bold text-navy-header">{serviceName}</span></p>
          </div>

          <div className="w-full pt-2 flex flex-col gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={handleAccept}
              className="w-full rounded-2xl bg-[#001F3F] py-3 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.97]"
            >
              {loading ? "שולח מענה..." : "אני פנויה, הציגו אותי להורה!"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleDismiss}
              className="w-full rounded-2xl border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-400 transition hover:bg-slate-50"
            >
              התעלם / לא רלוונטי
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}