"use client";

import { useEffect, useState, useCallback } from "react";
import { Calendar, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type NannyShiftHistoryItem = {
  id: string;
  nanny_id: string;
  nanny_name: string;
  date: string;
  raw_date: string;
  status: string;
};

export default function ParentHistoryPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [shifts, setShifts] = useState<NannyShiftHistoryItem[]>([]);
  const [startDate, setStartDate] = useState<string>(""); 
  const [endDate, setEndDate] = useState<string>("");     
  const [loadingData, setLoadingData] = useState<boolean>(true);

  const fetchShiftHistory = useCallback(async (resolvedParentId: string) => {
    if (!supabase) return;
    try {
      setLoadingData(true);
      console.log("History: Sending safe wild-card fetch for Parent:", resolvedParentId);

      // שולפים את האובייקט המלא של sitter_profiles + שם מ-profiles
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          sitter_id,
          booking_date,
          status,
          sitter_profiles ( * ),
          profiles:sitter_id ( first_name, last_name )
        `)
        .eq("parent_id", resolvedParentId);

      if (error) {
        console.warn("History: DB Response Error:", error.message);
        setShifts([]);
        return;
      }

      console.log("History: Safe DB Data Received:", data);

      if (data && data.length > 0) {
        const formatted = data.map((booking: any) => {
          let displayDate = "ללא תאריך";
          let rawDateStr = booking.booking_date || "";
          
          if (booking.booking_date) {
            const parts = booking.booking_date.split("-");
            if (parts.length === 3) {
              displayDate = `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
            }
          }
          
          // סריקה אוטומטית של השדות כדי למצוא את מזהה ה-AN הציבורי בלי לנחש שמות עמודות
          const profilesObj = booking.sitter_profiles;
          const nameRow = Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles;
          const nannyName =
            `${nameRow?.first_name ?? ""} ${nameRow?.last_name ?? ""}`.trim() || "שמרטפית AnyNanny";
          let publicNannyId = "";

          if (profilesObj) {
            // מחפש שדה שמכיל באופן ישיר את המזהה הציבורי (למשל ערך כמו AN-1004 או מספר קוד)
            const foundKey = Object.keys(profilesObj).find(
              key => String(profilesObj[key]).startsWith("AN-") || key.includes("code") || key.includes("display")
            );
            
            if (foundKey) {
              publicNannyId = String(profilesObj[foundKey]);
            } else if (profilesObj.id) {
              // fallback: יצירת פורמט AN זמני מבוסס ה-ID הקיים בפרופיל
              publicNannyId = `AN-${String(profilesObj.id).substring(0, 4).toUpperCase()}`;
            }
          }

          if (!publicNannyId) {
            publicNannyId = booking.sitter_id 
              ? `AN-${booking.sitter_id.substring(0, 4).toUpperCase()}` 
              : "AN-Unknown";
          }

          let statusLabel = "בפעילות";
          if (booking.status === "completed") statusLabel = "שולם";
          if (booking.status === "parent_started") statusLabel = "ממתין לאישור";

          return {
            id: booking.id,
            nanny_id: publicNannyId,
            nanny_name: nannyName,
            date: displayDate,
            raw_date: rawDateStr,
            status: statusLabel,
          };
        });
        setShifts(formatted);
      } else {
        setShifts([]);
      }
    } catch (err) {
      console.error("History: Request exception caught safely:", err);
    } finally {
      setLoadingData(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    const targetParentId = "1b4b958c-9013-481f-a8df-6ac0419aab83";
    
    // שליפה ראשונית של המידע
    fetchShiftHistory(targetParentId);
  
    // channel().on().subscribe() — chained on the same object (unique topic).
    const channel = subscribePostgresChanges(
      supabase,
      `history-realtime-${targetParentId}`,
      {
        event: "*",
        table: "bookings",
        filter: `parent_id=eq.${targetParentId}`,
        handler: () => {
          console.log("History Real-time: Verified update received from DB change.");
          fetchShiftHistory(targetParentId);
        }
      },
      (status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("History Real-time: Channel connected securely.");
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`History Real-time Status Notice: ${status}`, err?.message || "");
        }
      }
    );

    return () => {
      console.log("History Real-time: Cleaning up channel subscription.");
      removeRealtimeChannel(supabase, channel);
    };
  }, [fetchShiftHistory, supabase]);

  const filteredShifts = shifts.filter((shift) => {
    if (!shift.raw_date) return true;
    const shiftTime = new Date(shift.raw_date).getTime();
    if (startDate) {
      const startTime = new Date(startDate).getTime();
      if (shiftTime < startTime) return false;
    }
    if (endDate) {
      const endTime = new Date(endDate).getTime();
      if (shiftTime > endTime) return false;
    }
    return true;
  });

  return (
    <div className="w-full px-4 pt-2 pb-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/parent/dashboard")}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          <span>חזרה לדשבורד</span>
        </button>
        <button 
          onClick={() => fetchShiftHistory("1b4b958c-9013-481f-a8df-6ac0419aab83")} 
          className="p-1 text-slate-400 hover:text-slate-600"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="text-center">
        <h1 className="text-sm font-extrabold text-navy-header">היסטוריית שמרטפות</h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm max-w-sm mx-auto space-y-2">
        <div className="text-[10px] font-bold text-slate-400 pr-1 flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span>סינון לפי טווח תאריכים</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-slate-400 block mb-0.5 pr-1">מתאריך</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 px-2 text-[11px] text-slate-700 text-center"
              style={{ direction: "ltr" }}
            />
          </div>
          <div>
            <label className="text-[9px] text-slate-400 block mb-0.5 pr-1">עד תאריך</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 px-2 text-[11px] text-slate-700 text-center"
              style={{ direction: "ltr" }}
            />
          </div>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-soft overflow-hidden px-3 py-1">
        <div className="grid grid-cols-12 gap-2 pt-2.5 pb-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 px-1">
          <div className="col-span-5 text-right">פרטי השמרטפית</div>
          <div className="col-span-3 text-center">תאריך</div>
          <div className="col-span-2 text-center">סטטוס</div>
          <div className="col-span-2 text-left">פרטים</div>
        </div>

        <div className="divide-y divide-slate-100">
          {loadingData ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              <p className="text-[11px]">טוען נתונים...</p>
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              לא נמצאו משמרות בטווח שנבחר
            </div>
          ) : (
            filteredShifts.map((shift) => (
              <div key={shift.id} className="grid grid-cols-12 gap-2 py-3 items-center text-xs text-slate-700 font-medium px-1">
                <div className="col-span-5 text-right min-w-0">
                  <div className="font-bold text-slate-800 truncate">{shift.nanny_name}</div>
                  <div className="text-[9px] text-slate-400 font-mono tabular-nums mt-0.5">ID: {shift.nanny_id}</div>
                </div>
                <div className="col-span-3 text-center text-slate-500 tabular-nums">{shift.date}</div>
                <div className="col-span-2 text-center">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap ${
                    shift.status === "שולם" 
                      ? "bg-green-50 text-green-600" 
                      : shift.status === "ממתין לאישור"
                      ? "bg-blue-50 text-blue-600"
                      : "bg-amber-50 text-amber-600"
                  }`}>
                    {shift.status}
                  </span>
                </div>
                <div className="col-span-2 text-left">
                  <button onClick={() => alert(`משמרת מס׳ ${shift.id}`)} className="text-blue-600 font-bold hover:underline">צפייה</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}