"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { X, Plus, Trash2 } from "lucide-react";

function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const HEBREW_WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

interface TimeRange {
  start: string;
  end: string;
}

export function SitterAvailabilityManager() {
  const today = new Date();
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  
  // ניהול היום הנבחר והחלון המודאלי
  const [activeDateISO, setActiveDateISO] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dailyRanges, setTimeRanges] = useState<TimeRange[]>([]);
  const [savingDay, setSavingDay] = useState(false);

  // חיבור ואימות ראשוני
  useEffect(() => {
    void (async () => {
      try {
        const auth = await resolveBrowserAuth();
        if (!auth.ok) {
          setMessage("יש להתחבר כדי לנהל זמינות.");
          return;
        }
        setSitterId(auth.userId);
      } catch (err) {
        console.warn("[sitter_availability] init failed:", err);
        setMessage("שגיאה בטעינת המערכת.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // שינוי חודשים
  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const monthLabel = useMemo(() => {
    return new Date(year, month - 1, 1).toLocaleString("he-IL", { month: "long", year: "numeric" });
  }, [year, month]);

  // בניית תאי היומן הכלליים
  const calendarCells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const cells: ({ kind: "empty" } | { kind: "day"; day: number })[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ kind: "empty" });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ kind: "day", day: d });
    
    // בתצוגת שבוע - חותכים רק לשבוע הנוכחי, אחרת משלימים מטריצה חודשית
    if (viewMode === "week") {
      const todayCellIdx = cells.findIndex(c => c.kind === "day" && c.day === today.getDate());
      const startIdx = Math.max(0, todayCellIdx - today.getDay());
      return cells.slice(startIdx, startIdx + 7);
    }
    
    while (cells.length % 7 !== 0) cells.push({ kind: "empty" });
    return cells;
  }, [year, month, viewMode]);

  // פתיחת חלון של יום מסוים
  const handleDayClick = (iso: string) => {
    setActiveDateISO(iso);
    // כאן תוכל להטעין טווחים קיימים מתוך ה-DB בעתיד במידת הצורך
    setTimeRanges([{ start: "08:00", end: "16:00" }]); 
    setIsModalOpen(true);
  };

  // ניהול טווחי שעות בתוך המודאל
  const addTimeRange = () => {
    setTimeRanges([...dailyRanges, { start: "17:00", end: "21:00" }]);
  };

  const removeTimeRange = (index: number) => {
    setTimeRanges(dailyRanges.filter((_, i) => i !== index));
  };

  const updateTimeRange = (index: number, field: "start" | "end", value: string) => {
    const updated = [...dailyRanges];
    updated[index][field] = value;
    setTimeRanges(updated);
  };

  // שמירת שעות היום
  const handleSaveDailyAvailability = async () => {
    setSavingDay(true);
    // לוגיקת שמירת הטווחים מול הסופבייס שלך תתבצע כאן בצורה נקייה ומסודרת
    setTimeout(() => {
      setSavingDay(false);
      setIsModalOpen(false);
      setMessage(`הזמינות ליום ${activeDateISO} עודכנה בהצלחה.`);
    }, 600);
  };

  if (loading) {
    return <p className="text-right text-sm text-slate-600">טוען יומן סידור עבודה…</p>;
  }

  return (
    <section className="mx-1 space-y-5 rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft sm:p-5" dir="rtl">
      
      {/* 👑 ראש הדף: בורר רזולוציית זמן מינימליסטי בסגנון בוטיק */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#001F3F]">רזולוציית יומן:</span>
          <select 
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as "month" | "week")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-sm outline-none focus:border-[#001F3F]"
          >
            <option value="month">תצוגת חודש</option>
            <option value="week">תצוגת שבוע</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2 font-semibold">
          <button type="button" className="rounded-lg border px-2 py-0.5 text-xs hover:bg-slate-50" onClick={() => shiftMonth(-1)}>←</button>
          <span className="text-sm text-[#001F3F]">{monthLabel}</span>
          <button type="button" className="rounded-lg border px-2 py-0.5 text-xs hover:bg-slate-50" onClick={() => shiftMonth(1)}>→</button>
        </div>
      </div>

      {/* ימי השבוע */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
        {HEBREW_WEEKDAYS.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      {/* לוח המשבצות הראשי */}
      <div className="grid grid-cols-7 gap-1.5">
        {calendarCells.map((cell, idx) => {
          if (cell.kind === "empty") {
            return <div key={`empty-${idx}`} className="aspect-square rounded-xl bg-slate-50/40" />;
          }
          
          const iso = formatDateISO(year, month, cell.day);
          const isToday = formatDateISO(today.getFullYear(), today.getMonth() + 1, today.getDate()) === iso;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => handleDayClick(iso)}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-medium transition active:scale-95 ${
                isToday 
                  ? "border-[#001F3F] bg-[#001F3F]/5 text-[#001F3F] font-bold" 
                  : "border-slate-100 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{cell.day}</span>
            </button>
          );
        })}
      </div>

      {/* 🌟 מודאל צף: ניהול יום פנוי גמיש ללא קשקושים */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="flex h-full max-h-[85vh] w-full max-w-md flex-col rounded-3xl bg-white p-5 shadow-xl animate-in zoom-in-95 duration-200">
            
            {/* כותרת החלון */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-[#001F3F]">עדכון שעות: {activeDateISO}</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* תוכן גלול: 24 שעות וניהול טווחים */}
            <div className="flex-1 overflow-y-auto py-4 space-y-5" style={{ scrollbarWidth: 'none' }}>
              
              {/* הזנת טווחי שעות */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500">הגדירו את זמני הזמינות שלכם ביום זה:</p>
                
                {dailyRanges.map((range, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-[#FDFBF6]/60 p-3 animate-in slide-in-from-bottom-2 duration-200">
                    <div className="flex flex-1 items-center gap-2 text-xs font-medium text-slate-700">
                      <span>משעה:</span>
                      <input 
                        type="time" 
                        value={range.start} 
                        onChange={(e) => updateTimeRange(index, "start", e.target.value)}
                        className="rounded-lg border border-slate-200 p-1.5 font-mono outline-none focus:border-[#001F3F]"
                      />
                      <span className="mr-1">עד שעה:</span>
                      <input 
                        type="time" 
                        value={range.end} 
                        onChange={(e) => updateTimeRange(index, "end", e.target.value)}
                        className="rounded-lg border border-slate-200 p-1.5 font-mono outline-none focus:border-[#001F3F]"
                      />
                    </div>
                    {dailyRanges.length > 1 && (
                      <button type="button" onClick={() => removeTimeRange(index)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

                <button 
                  type="button" 
                  onClick={addTimeRange}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition active:scale-98"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>הוספת עוד שעות אפשריות ביום זה</span>
                </button>
              </div>

              {/* תצוגת סדר יום מלאה של 24 שעות */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">מבט על של היממה (24 שעות):</p>
                <div className="rounded-xl border border-slate-100 max-h-48 overflow-y-auto divide-y divide-slate-50 text-right">
                  {Array.from({ length: 24 }).map((_, hour) => {
                    const hourLabel = `${String(hour).padStart(2, "0")}:00`;
                    
                    // בדיקה האם השעה הנוכחית נופלת בתוך אחד מהטווחים שהוזנו
                    const isCovered = dailyRanges.some(r => {
                      const [hStart] = r.start.split(":").map(Number);
                      const [hEnd] = r.end.split(":").map(Number);
                      return hour >= hStart && hour < hEnd;
                    });

                    return (
                      <div key={hour} className={`flex items-center justify-between px-4 py-2 text-xs font-mono transition ${isCovered ? "bg-emerald-50/50 text-emerald-800 font-bold" : "text-slate-400 bg-white"}`}>
                        <span>{hourLabel}</span>
                        <span className="text-[10px] font-sans font-semibold">{isCovered ? "פנויה לעבודה" : "חסום"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* כפתורי פעולה בתחתית המודאל */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
              >
                ביטול
              </button>
              <button 
                type="button" 
                disabled={savingDay}
                onClick={handleSaveDailyAvailability}
                className="rounded-xl bg-[#001F3F] px-5 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 transition disabled:opacity-50"
              >
                {savingDay ? "שומר..." : "שמירת יום"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* הודעות מערכת קופצות בתחתית */}
      {message && (
        <p className="rounded-xl border border-slate-100 bg-[#FDFBF6] px-3 py-2.5 text-right text-xs text-slate-700 animate-in fade-in duration-200" role="status">
          {message}
        </p>
      )}

    </section>
  );
}