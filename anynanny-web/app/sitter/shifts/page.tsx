"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SitterPageShell } from "@/components/sitter/sitter-page-shell";
import { createClient } from "@supabase/supabase-js"; // ודא שאתה מייבא את ה-client המקומי שלך אם יש כזה (למשל `@/lib/supabase/client`)

// יצירת קליינט זמני במידה ואין קליינט גלובלי מוכן בפרויקט
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Shift {
  id: string;
  parent_name: string;
  parent_id: string;
  date: string;
  start_time: string;
  end_time: string;
  address: string;
}

export default function SitterShiftsPage() {
  const router = useRouter();
  
  const [viewType, setViewType] = useState<"upcoming" | "past">("upcoming");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleAddressId, setVisibleAddressId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRealShifts = async () => {
      setLoading(true);
      try {
        // 1. קבלת היוזר המחובר (הנני)
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          console.error("User not authenticated");
          setLoading(false);
          return;
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // 2. בניית השאילתה הבסיסית עם Join לטבלת profiles לקבלת שם ההורה
        let query = supabase
          .from("bookings")
          .select(`
            id,
            parent_id,
            booking_date,
            start_time,
            end_time,
            status,
            profiles:parent_id ( full_name )
          `)
          .eq("sitter_id", user.id);

        // 3. סינון לפי הבחירה ב-Dropdown (עתידיות מול עבר)
        if (viewType === "upcoming") {
          query = query.gte("booking_date", todayStr).neq("status", "completed");
        } else {
          // משמרות שבוצעו
          query = query.eq("status", "completed");
        }

        const { data, error } = await query.order("booking_date", { ascending: viewType === "upcoming" });

        if (error) throw error;

        // 4. מיפוי הנתונים מה-DB לתוך ה-State של הממשק
        const formattedShifts: Shift[] = (data || []).map((b: any) => {
          // חילוץ פורמט שעות קריא מתוך ה-Timestamp
          const formatTime = (ts: string) => {
            if (!ts) return "--:--";
            const d = new Date(ts);
            return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
          };

          // פורמט תאריך ישראלי קריא
          const formatDate = (dateStr: string) => {
            if (!dateStr) return "";
            const [year, month, day] = dateStr.split("-");
            return `${day}/${month}/${year}`;
          };

          return {
            id: b.id,
            parent_id: b.parent_id,
            parent_name: b.profiles?.full_name || "הורה AnyNanny",
            date: formatDate(b.booking_date),
            start_time: formatTime(b.start_time),
            end_time: formatTime(b.end_time),
            address: "הכתובת תיטען בהמשך מחשבון ההורה..." // נשאר ככה עד שנגדיר את שדה הכתובת בטבלה
          };
        });

        setShifts(formattedShifts);
      } catch (err) {
        console.error("Error fetching shifts from Supabase:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRealShifts();
  }, [viewType]);

  const handleContactClick = (parentId: string) => {
    router.push(`/sitter/chat?parentId=${parentId}`);
  };

  const toggleAddressVisibility = (shiftId: string) => {
    setVisibleAddressId(visibleAddressId === shiftId ? null : shiftId);
  };

  return (
    <SitterPageShell
      title="לוח המשמרות שלי"
      subtitle="בקשות ממתינות לאישור, ומשמרות מאושרות — הכל מטבלת הבקשות האמיתית."
    >
      <div className="w-full max-w-md mx-auto text-right" dir="rtl">
        
        {/* 🔽 רשימה נפתחת (Dropdown) */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2 mr-1">
            בחר סוג תצוגה
          </label>
          <div className="relative">
            <select
              value={viewType}
              onChange={(e) => {
                setViewType(e.target.value as "upcoming" | "past");
                setVisibleAddressId(null);
              }}
              className="w-full p-3.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-700 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 appearance-none transition-all cursor-pointer"
            >
              <option value="upcoming">🔮 משמרות עתידיות</option>
              <option value="past">✅ משמרות שבוצעו</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* 📋 רשימת המשמרות האמיתיות מה-DB */}
        {loading ? (
          <div className="text-center py-10 text-gray-400 font-medium">מושך נתונים חיים מה-Database...</div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
            אין משמרות רשומות בקטגוריה זו ב-Supabase.
          </div>
        ) : (
          <div className="space-y-4">
            {shifts.map((shift) => (
              <div 
                key={shift.id}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col space-y-4"
              >
                {/* שם ההורה (מתוך פרופילים) */}
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-gray-800">{shift.parent_name}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    viewType === "upcoming" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {viewType === "upcoming" ? "עתידית" : "בוצעה"}
                  </span>
                </div>

                {/* תאריך ושעה אמיתיים מה-Row */}
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl text-sm">
                  <div>
                    <span className="block text-xs text-gray-400 font-medium mb-0.5">תאריך</span>
                    <span className="font-bold text-gray-700">{shift.date}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-400 font-medium mb-0.5">זמן המשמרת</span>
                    <span className="font-bold text-gray-700">{shift.start_time} - {shift.end_time}</span>
                  </div>
                </div>

                {/* לחצנים */}
                {viewType === "upcoming" && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      onClick={() => toggleAddressVisibility(shift.id)}
                      className="flex items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
                    >
                      📍 {visibleAddressId === shift.id ? "הסתר כתובת" : "הצג כתובת"}
                    </button>
                    <button
                      onClick={() => handleContactClick(shift.parent_id)}
                      className="flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors shadow-sm shadow-amber-100"
                    >
                      💬 צור קשר
                    </button>
                  </div>
                )}

                {/* בועית הכתובת */}
                {visibleAddressId === shift.id && (
                  <div className="bg-amber-50/60 border border-amber-100 text-amber-900 p-3 rounded-xl text-sm">
                    <span className="block text-xs text-amber-700 font-bold mb-0.5">כתובת זמנית:</span>
                    <span className="font-semibold">{shift.address}</span>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </div>
    </SitterPageShell>
  );
}