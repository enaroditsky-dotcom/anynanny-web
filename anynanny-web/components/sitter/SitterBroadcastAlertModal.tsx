"use client";

import { useEffect, useState, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Zap } from "lucide-react";

interface BroadcastAlertModalProps {
  sitterId: string;
}

export function SitterBroadcastAlertModal({ sitterId }: BroadcastAlertModalProps) {
  const [activeAlert, setActiveAlert] = useState<{ id: string; city: string; service_type: string } | null>(null);
  const [sitterCities, setSitterCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 🔥 פתרון הלופ: נשמור רשימה של מזהי קריאות שהנני כבר לחצה עליהן "התעלם" בגרסת הריצה הנוכחית
  const dismissedAlertIdsRef = useRef<Set<string>>(new Set());

  // 1. שליפת מערך הערים של הנני
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
      }
    }
    loadSitterCities();
  }, [sitterId]);

  // 2. טעינה ראשונית והאזנה בזמן אמת - מתוקן ללא לופים
  useEffect(() => {
    if (sitterCities.length === 0) return;
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

    // בדיקה ראשונית חכמה
    async function checkExistingAlerts() {
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("broadcast_alerts")
        .select("id, city, service_type, status, created_at")
        .in("city", sitterCities)
        .eq("status", "pending")
        .gte("created_at", twentyMinutesAgo)
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        // 🔥 בודקים שלא התעלמנו מהקריאה הזו כבר
        const validAlert = data.find(alert => !dismissedAlertIdsRef.current.has(alert.id));
        if (validAlert) {
          setActiveAlert({
            id: validAlert.id,
            city: validAlert.city,
            service_type: validAlert.service_type
          });
        }
      }
    }
    
    checkExistingAlerts();

    // פתיחת ערוצי האזנה
    const channels = sitterCities.map((city) => {
      const channel = supabase
        .channel(`sitter-broadcast-room-${city}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "broadcast_alerts", filter: `city=eq.${city}` },
          (payload) => {
            if (payload.new && payload.new.status === "pending") {
              // 🔥 בודקים שלא דחינו אותה בעבר
              if (!dismissedAlertIdsRef.current.has(payload.new.id)) {
                setActiveAlert({
                  id: payload.new.id,
                  city: payload.new.city,
                  service_type: payload.new.service_type
                });
                playAlertSound();
              }
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "broadcast_alerts", filter: `city=eq.${city}` },
          (payload) => {
            if (payload.new.status === "expired" || payload.new.status === "filled") {
              setActiveAlert((current) => (current?.id === payload.new.id ? null : current));
            }
          }
        )
        .subscribe();

      return channel;
    });

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
    // 🔥 שים לב: הוצאנו את activeAlert?.id מה-Dependency Array! זה המפתח לעצירת הלופ!
  }, [sitterCities]);

  const handleAccept = async () => {
    if (!activeAlert) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    try {
      const { error } = await supabase
        .from("broadcast_responses")
        .insert([{ alert_id: activeAlert.id, sitter_id: sitterId }]);

      if (error) {
        if (error.code === "23505") alert("כבר אישרת את הקריאה הזו!");
        else throw error;
      } else {
        alert("אישור הזמינות נשלח בהצלחה!");
      }
    } catch (err) {
      alert("תקלה בשליחת האישור.");
    } finally {
      setLoading(false);
      setActiveAlert(null);
    }
  };

  const handleDismiss = () => {
    if (activeAlert) {
      // 🔥 הוספת האיידי לרשימת המושתקים המקומית כדי שלא יקפוץ שוב בחיים
      dismissedAlertIdsRef.current.add(activeAlert.id);
    }
    setActiveAlert(null);
  };

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