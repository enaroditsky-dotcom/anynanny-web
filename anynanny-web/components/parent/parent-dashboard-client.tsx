"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ParentBusySlot, ParentPreferences } from "@/lib/parent/types";
import type { NannyProfile } from "@/lib/ratings/types";
import type { SessionView } from "@/lib/session/types";

type Suggestion = {
  date: string;
  message: string;
  suggestedSitters: string[];
};

const CALENDAR_PRIVACY_HINT =
  "אנחנו רק מחפשים חלונות זמן פנויים. שמות האירועים והפרטים האישיים שלך נשארים פרטיים ולעולם לא נשמרים אצלנו.";

/** Evening suggestion dates derived locally from free/busy only — never sent to server as event metadata. */
function extractEveningSuggestionDates(slots: ParentBusySlot[], nowMs: number): string[] {
  const now = new Date(nowMs);
  const dates = new Set<string>();
  for (const slot of slots) {
    const start = new Date(slot.startsAt);
    if (Number.isNaN(start.getTime()) || start <= now) continue;
    if (start.getHours() >= 18) dates.add(slot.startsAt.slice(0, 10));
  }
  return [...dates];
}

function fmtNis(value: number) {
  return `₪${value.toFixed(2)}`;
}

function computeLiveMinutes(session: SessionView | null, nowMs: number): number {
  if (!session?.startedAt) return 0;
  const endIso = session.endedAt ?? (session.status === "active" ? new Date(nowMs).toISOString() : session.startedAt);
  const minutes = Math.floor((new Date(endIso).getTime() - new Date(session.startedAt).getTime()) / 60000);
  return Math.max(0, minutes);
}

export function ParentDashboardClient({
  initialProfiles,
  initialPreferences,
  initialBusySlots
}: {
  initialProfiles: NannyProfile[];
  initialPreferences: ParentPreferences;
  initialBusySlots: ParentBusySlot[];
}) {
  const [prefs, setPrefs] = useState(initialPreferences);
  const [busySlots, setBusySlots] = useState(initialBusySlots);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<SessionView | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [duePings, setDuePings] = useState<string[]>([]);
  const [selectedSitter, setSelectedSitter] = useState(initialProfiles[0]?.nannyName ?? "demo-sitter-1");
  /** Optional note visible only on device — never POSTed */
  const [newBusy, setNewBusy] = useState({ startsAt: "", endsAt: "", localNote: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProfiles = useMemo(
    () =>
      initialProfiles.filter((profile) => {
        const q = searchTerm.trim().toLowerCase();
        if (q && !profile.nannyName.toLowerCase().includes(q) && !profile.anyNannyId.toLowerCase().includes(q)) return false;
        if (profile.hourlyRateNis < prefs.minRate || profile.hourlyRateNis > prefs.maxRate) return false;
        if (prefs.preferredGender !== "all" && profile.gender !== prefs.preferredGender) return false;
        if (profile.age < prefs.minAge) return false;
        if (profile.experienceYears < prefs.minExperienceYears) return false;
        if (profile.reputationScore < prefs.minRating) return false;
        return true;
      }),
    [initialProfiles, prefs, searchTerm]
  );

  const refreshBusySlots = useCallback(async (parentNameOverride?: string) => {
    const name = parentNameOverride ?? prefs.parentName;
    const response = await fetch(`/api/parent/calendar-events?parentName=${encodeURIComponent(name)}`);
    if (!response.ok) return;
    const data = (await response.json()) as { busySlots: ParentBusySlot[] };
    setBusySlots(data.busySlots);
  }, [prefs.parentName]);

  const requestSuggestionsFromServer = useCallback(async (eveningDates: string[]) => {
    if (eveningDates.length === 0) {
      setSuggestions([]);
      return;
    }
    const response = await fetch("/api/parent/calendar-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentName: prefs.parentName, eveningDates })
    });
    if (!response.ok) return;
    const data = (await response.json()) as { suggestions: Suggestion[] };
    setSuggestions(data.suggestions ?? []);
  }, [prefs.parentName]);

  const savePreferences = async (next: ParentPreferences) => {
    setPrefs(next);
    const response = await fetch("/api/parent/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    });
    setMessage(response.ok ? "העדפות נשמרו." : "שמירת העדפות נכשלה.");
    if (response.ok) await refreshBusySlots(next.parentName);
  };

  const addBusySlot = async () => {
    if (!newBusy.startsAt || !newBusy.endsAt) return;
    const response = await fetch("/api/parent/calendar-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentName: prefs.parentName,
        startsAt: new Date(newBusy.startsAt).toISOString(),
        endsAt: new Date(newBusy.endsAt).toISOString()
      })
    });
    if (response.ok) {
      setNewBusy({ startsAt: "", endsAt: "", localNote: "" });
      setMessage("חלון תפוס נשמר (זמנים בלבד — ללא פרטי אירוע).");
      await refreshBusySlots();
    }
  };

  useEffect(() => {
    const eveningDates = extractEveningSuggestionDates(busySlots, Date.now());
    const handle = window.setTimeout(() => void requestSuggestionsFromServer(eveningDates), 320);
    return () => window.clearTimeout(handle);
  }, [busySlots, requestSuggestionsFromServer]);

  const confirmAction = async (party: "parent" | "sitter", action: "start" | "end") => {
    const targetRate = initialProfiles.find((p) => p.nannyName === selectedSitter)?.hourlyRateNis ?? 60;
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session?.sessionId,
        bookingId: session?.bookingId ?? `booking_${Date.now()}`,
        sitterId: selectedSitter,
        parentName: prefs.parentName,
        hourlyRateNis: targetRate,
        party,
        action,
        reassurancePingEnabled: prefs.reassurancePingEnabled
      })
    });
    if (!response.ok) return;
    const data = (await response.json()) as { session: SessionView };
    setSession(data.session);
  };

  useEffect(() => {
    if (!session?.sessionId) return;
    const poll = async () => {
      const response = await fetch(`/api/session?sessionId=${session.sessionId}`);
      if (!response.ok) return;
      const data = (await response.json()) as { session: SessionView; dueReassurancePings: string[] };
      setSession(data.session);
      if (data.dueReassurancePings.length > 0) {
        setDuePings((prev) => [...prev, ...data.dueReassurancePings]);
        if (typeof window !== "undefined" && prefs.reassurancePingEnabled) {
          const ctx = new window.AudioContext();
          const osc = ctx.createOscillator();
          osc.connect(ctx.destination);
          osc.frequency.value = 880;
          osc.start();
          setTimeout(() => {
            osc.stop();
            void ctx.close();
          }, 180);
        }
      }
    };
    const timer = setInterval(poll, 10000);
    void poll();
    return () => clearInterval(timer);
  }, [session?.sessionId, prefs.reassurancePingEnabled]);

  useEffect(() => {
    const ticker = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  const liveMinutes = computeLiveMinutes(session, nowMs);
  const liveCost = session ? (session.hourlyRateNis / 60) * liveMinutes : 0;
  const waitingText =
    session?.waitingFor === "parent" ? "ממתין/ה לאישור הורה" : session?.waitingFor === "sitter" ? "ממתין/ה לאישור סיטר/ית" : "";

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8" dir="rtl">
      <header className="rounded-2xl bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-navy-900">דשבורד הורה</h1>
        <p className="mt-1 text-sm text-navy-700">ניהול סינונים, אישורי סשן כפולים, יומן אישי וחישוב עלות מדויק בדקות.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-4">
        <div className="rounded-xl bg-navy-50 p-3 text-sm">📅 יומן אישי</div>
        <div className="rounded-xl bg-navy-50 p-3 text-sm">📍 מיקום: {prefs.locationLabel}</div>
        <div className="rounded-xl bg-navy-50 p-3 text-sm">🚗 הגעה: {prefs.transportMode === "taxi" ? "מונית" : prefs.transportMode === "self" ? "עצמי" : "ללא מונית"}</div>
        <div className="rounded-xl bg-navy-50 p-3 text-sm">🎓 סינונים חכמים</div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-navy-900">העדפות וסינונים</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">שם הורה<input className="mt-1 w-full rounded-lg border p-2" value={prefs.parentName} onChange={(e) => setPrefs({ ...prefs, parentName: e.target.value })} /></label>
          <label className="text-sm">AnyNanny ID מועדף
            <input
              className="mt-1 w-full rounded-lg border p-2"
              value={prefs.favoriteSitterId}
              onChange={(e) => setPrefs({ ...prefs, favoriteSitterId: e.target.value })}
              placeholder="ANN-..."
            />
          </label>
          <label className="text-sm">מיקום<input className="mt-1 w-full rounded-lg border p-2" value={prefs.locationLabel} onChange={(e) => setPrefs({ ...prefs, locationLabel: e.target.value })} /></label>
          <label className="text-sm">מינימום ₪<input type="number" className="mt-1 w-full rounded-lg border p-2" value={prefs.minRate} onChange={(e) => setPrefs({ ...prefs, minRate: Number(e.target.value) })} /></label>
          <label className="text-sm">מקסימום ₪<input type="number" className="mt-1 w-full rounded-lg border p-2" value={prefs.maxRate} onChange={(e) => setPrefs({ ...prefs, maxRate: Number(e.target.value) })} /></label>
          <label className="text-sm">מגדר
            <select className="mt-1 w-full rounded-lg border p-2" value={prefs.preferredGender} onChange={(e) => setPrefs({ ...prefs, preferredGender: e.target.value as ParentPreferences["preferredGender"] })}>
              <option value="all">הכל</option><option value="female">אישה</option><option value="male">גבר</option>
            </select>
          </label>
          <label className="text-sm">הגעה
            <select className="mt-1 w-full rounded-lg border p-2" value={prefs.transportMode} onChange={(e) => setPrefs({ ...prefs, transportMode: e.target.value as ParentPreferences["transportMode"] })}>
              <option value="taxi">מונית</option><option value="self">עצמי</option><option value="no_taxi">ללא מונית</option>
            </select>
          </label>
          <label className="text-sm">גיל מינימלי<input type="number" min={18} className="mt-1 w-full rounded-lg border p-2" value={prefs.minAge} onChange={(e) => setPrefs({ ...prefs, minAge: Number(e.target.value) })} /></label>
          <label className="text-sm">ניסיון מינימלי (שנים)<input type="number" min={0} className="mt-1 w-full rounded-lg border p-2" value={prefs.minExperienceYears} onChange={(e) => setPrefs({ ...prefs, minExperienceYears: Number(e.target.value) })} /></label>
          <label className="text-sm">דירוג מינימלי<input type="number" min={0} max={5} step={0.1} className="mt-1 w-full rounded-lg border p-2" value={prefs.minRating} onChange={(e) => setPrefs({ ...prefs, minRating: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.reassurancePingEnabled} onChange={(e) => setPrefs({ ...prefs, reassurancePingEnabled: e.target.checked })} /> פינג הרגעה שעתי</label>
          <div className="md:col-span-2 rounded-xl border border-navy-100 bg-navy-50/60 p-3">
            <p className="mb-2 text-xs font-medium text-navy-900" title="גישת קריאה בלבד (זמינות / תפוס)">
              סנכרון יומן — הרשאת קריאה בלבד (Free/Busy)
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.calendarSyncGoogle} onChange={(e) => setPrefs({ ...prefs, calendarSyncGoogle: e.target.checked })} /> סנכרון Google Calendar
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.calendarSyncPhone} onChange={(e) => setPrefs({ ...prefs, calendarSyncPhone: e.target.checked })} /> סנכרון יומן טלפון
            </label>
            <p className="mt-2 text-xs leading-relaxed text-navy-600">{CALENDAR_PRIVACY_HINT}</p>
          </div>
        </div>
        <button className="mt-3 rounded-xl bg-navy-800 px-4 py-2 text-sm font-medium text-white" onClick={() => void savePreferences(prefs)}>שמירת העדפות</button>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-navy-900">סיטרים זמינים לפי פילטר</h2>
        <input
          className="mb-3 w-full rounded-lg border border-navy-200 p-2 text-sm"
          placeholder="חיפוש לפי שם סיטר/ית או AnyNanny ID"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="space-y-2">
          {filteredProfiles.map((profile) => (
            <div key={profile.nannyName} className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span>
                {profile.nannyName} · {profile.anyNannyId} · ₪{profile.hourlyRateNis} · {profile.gender === "female" ? "אישה" : "גבר"} · ⭐{profile.reputationScore}
              </span>
              <button className="rounded-lg border px-3 py-1" onClick={() => setSelectedSitter(profile.nannyName)}>בחירה</button>
            </div>
          ))}
          {filteredProfiles.length === 0 ? <p className="text-sm text-navy-700">לא נמצאו תוצאות לסינון.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-navy-900">Double-Shake: ניהול סשן</h2>
        <p className="text-sm text-navy-700">הסשן מתחיל/מסתיים רק אחרי אישור של שני הצדדים. אם צד אחד אישר, מוצג מצב המתנה.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white" onClick={() => void confirmAction("parent", "start")}>הורה מאשר התחלה</button>
          <button className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white" onClick={() => void confirmAction("parent", "end")}>הורה מאשר סיום</button>
        </div>
        <p className="mt-2 text-xs text-slate-600">האישור של הסיטר/ית מתבצע ממסך הסשן שלהם.</p>
        {session ? (
          <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm">
            <p>סטטוס: <strong>{session.status}</strong></p>
            {waitingText ? <p className="text-amber-700">ממתין לצד השני: {waitingText}</p> : null}
            <p>משך מדויק: {liveMinutes} דקות</p>
            <p>עלות מצטברת: {fmtNis(liveCost)}</p>
            <p className="text-xs text-slate-600">מזהה סשן לשיתוף: {session.sessionId}</p>
          </div>
        ) : null}
        {duePings.length > 0 ? <p className="mt-2 text-xs text-amber-700">הופעל פינג הרגעה בשעות: {duePings.join(", ")}</p> : null}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-navy-900">סנכרון יומן והצעות חכמות</h2>
        <p className="mb-3 text-xs text-navy-600">
          זיהוי ערב מתבצע במכשיר שלך מתוך חלונות &quot;תפוס&quot; בלבד. לשרת נשלחות רק תאריכי ערב (ללא שם אירוע או פרטים).
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            className="rounded-lg border p-2 text-sm"
            placeholder="הערה לעצמך (לא נשמרת בשרת)"
            value={newBusy.localNote}
            onChange={(e) => setNewBusy({ ...newBusy, localNote: e.target.value })}
          />
          <input className="rounded-lg border p-2 text-sm" type="datetime-local" value={newBusy.startsAt} onChange={(e) => setNewBusy({ ...newBusy, startsAt: e.target.value })} />
          <input className="rounded-lg border p-2 text-sm" type="datetime-local" value={newBusy.endsAt} onChange={(e) => setNewBusy({ ...newBusy, endsAt: e.target.value })} />
        </div>
        <button className="mt-2 rounded-lg bg-navy-800 px-3 py-2 text-sm text-white" onClick={() => void addBusySlot()}>
          שמירת חלון תפוס (Free/Busy)
        </button>
        <div className="mt-3 space-y-2 text-sm">
          {suggestions.map((s) => (
            <div key={s.date} className="rounded-lg border p-3">
              <p>{s.message}</p>
              {s.suggestedSitters[0] ? (
                <Link className="mt-1 inline-block text-navy-800 underline" href={`/parent/sitter/${encodeURIComponent(s.suggestedSitters[0])}/calendar`}>
                  מעבר ליומן זמינות של {s.suggestedSitters[0]}
                </Link>
              ) : (
                <p className="text-xs text-slate-600">אין כרגע סיטרים זמינים בתאריך זה.</p>
              )}
            </div>
          ))}
          {busySlots.length === 0 ? <p className="text-sm text-slate-600">אין חלונות תפוסים שמורים — הוסיפו זמני התחלה וסיום בלבד.</p> : null}
        </div>
      </section>
      {message ? <p className="text-sm text-navy-700">{message}</p> : null}
    </main>
  );
}
