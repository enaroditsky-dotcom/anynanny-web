"use client";

import { useState } from "react";
import type { NannyProfile } from "@/lib/ratings/types";

export default function SignUpPage() {
  const [nannyName, setNannyName] = useState("Maya Cohen");
  const [gender, setGender] = useState<"male" | "female">("female");
  const [hourlyRateNis, setHourlyRateNis] = useState(65);
  const [age, setAge] = useState(24);
  const [experienceYears, setExperienceYears] = useState(2);
  const [message, setMessage] = useState("");
  const [generatedId, setGeneratedId] = useState("");

  const saveProfile = async () => {
    setMessage("");
    const response = await fetch("/api/sitters/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nannyName, gender, hourlyRateNis, age, experienceYears })
    });
    if (!response.ok) {
      setMessage("שמירת הפרופיל נכשלה.");
      return;
    }
    const data = (await response.json()) as { profile: NannyProfile };
    setGeneratedId(data.profile.anyNannyId);
    setMessage("הפרופיל נשמר בהצלחה.");
  };

  return (
    <main className="mx-auto max-w-md space-y-4 p-6 md:py-16" dir="rtl">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">פתיחת פרופיל סיטר/ית</h1>
      <p className="text-sm text-navy-700">הוספת מגדר ותעריף לשעה לצורך סינון וחיוב הוגן.</p>

      <label className="block text-sm text-navy-900">
        שם מלא
        <input className="mt-1 block w-full rounded-lg border border-navy-200 p-2" value={nannyName} onChange={(e) => setNannyName(e.target.value)} />
      </label>
      <label className="block text-sm text-navy-900">
        מגדר
        <select className="mt-1 block w-full rounded-lg border border-navy-200 p-2" value={gender} onChange={(e) => setGender(e.target.value as "male" | "female")}>
          <option value="female">אישה</option>
          <option value="male">גבר</option>
        </select>
      </label>
      <label className="block text-sm text-navy-900">
        תעריף לשעה (₪)
        <input className="mt-1 block w-full rounded-lg border border-navy-200 p-2" type="number" min={1} value={hourlyRateNis} onChange={(e) => setHourlyRateNis(Number(e.target.value))} />
      </label>
      <label className="block text-sm text-navy-900">
        גיל
        <input className="mt-1 block w-full rounded-lg border border-navy-200 p-2" type="number" min={18} value={age} onChange={(e) => setAge(Number(e.target.value))} />
      </label>
      <label className="block text-sm text-navy-900">
        שנות ניסיון
        <input className="mt-1 block w-full rounded-lg border border-navy-200 p-2" type="number" min={0} value={experienceYears} onChange={(e) => setExperienceYears(Number(e.target.value))} />
      </label>

      <button className="w-full rounded-xl bg-navy-800 px-4 py-2 text-sm font-medium text-white" onClick={saveProfile}>
        שמירת פרופיל
      </button>
      {generatedId ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
          מספר AnyNanny שלך: <span className="font-mono">{generatedId}</span>
        </p>
      ) : null}
      {message ? <p className="text-sm text-navy-700">{message}</p> : null}
    </main>
  );
}
