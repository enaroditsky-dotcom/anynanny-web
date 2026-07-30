"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import {
  PersonalAreaSection,
  PersonalCheckbox,
  PersonalField,
  personalInputClassName,
  personalTextareaClassName
} from "@/components/personal-area/personal-area-ui";
import { SitterBankDetailsSection } from "@/components/sitter/SitterBankDetailsSection";
import type { IsraelCity } from "@/lib/geo/israel-cities";
import { normalizeWorkingCities } from "@/lib/geo/israel-cities";
import {
  formatSitterDisplayName,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";

type FormState = {
  first_name: string;
  last_name: string;
  birth_date: string;
  show_age: boolean;
  show_full_name: boolean;
  id_number: string;
  address_full: string;
  citizenship_israeli: boolean | null;
  birth_country: string;
  aliyah_year: string;
  military_service: string;
  years_experience: string;
  hourly_rate_nis: string;
  preferred_ages: string;
  languages: string;
  has_car: boolean;
  homework_help: boolean;
  light_cooking: boolean;
  bio: string;
  referee_phone_1: string;
  referee_phone_2: string;
  legal_no_criminal_declaration: boolean;
  working_cities: IsraelCity[];
  nanny_serial: string;
};

function militaryToForm(value: unknown): string {
  if (value === true || value === "true" || value === "כן") return "כן";
  if (value === false || value === "false" || value === "לא") return "לא";
  if (typeof value === "string" && value.trim()) return value.trim();
  return "כן";
}

function militaryToPayload(value: string): string {
  return value === "לא" ? "לא" : "כן";
}

function profileToForm(profile: SitterProfileRow | null): FormState {
  return {
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    birth_date: (profile?.birth_date ?? "").toString().slice(0, 10),
    show_age: profile?.show_age !== false,
    show_full_name: Boolean(profile?.show_full_name),
    id_number: profile?.id_number ?? "",
    address_full: profile?.address_full ?? "",
    citizenship_israeli:
      profile?.citizenship_israeli === true
        ? true
        : profile?.citizenship_israeli === false
          ? false
          : null,
    birth_country: profile?.birth_country ?? "",
    aliyah_year: profile?.aliyah_year != null ? String(profile.aliyah_year) : "",
    military_service: militaryToForm(profile?.military_service),
    years_experience: profile?.years_experience != null ? String(profile.years_experience) : "",
    hourly_rate_nis: profile?.hourly_rate_nis != null ? String(profile.hourly_rate_nis) : "",
    preferred_ages: profile?.preferred_ages ?? "",
    languages: profile?.languages ?? "",
    has_car: Boolean(profile?.has_car),
    homework_help: Boolean(profile?.homework_help),
    light_cooking: Boolean(profile?.light_cooking),
    bio: profile?.bio ?? "",
    referee_phone_1: profile?.referee_phone_1 ?? "",
    referee_phone_2: profile?.referee_phone_2 ?? "",
    legal_no_criminal_declaration: Boolean(profile?.legal_no_criminal_declaration),
    working_cities: normalizeWorkingCities(profile?.working_cities),
    nanny_serial: profile?.nanny_serial ?? ""
  };
}

type Props = {
  userId: string | null;
};

export function SitterPersonalArea({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(profileToForm(null));

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sitter/profile", { method: "GET", cache: "no-store" });
      const json = (await response.json()) as { profile?: SitterProfileRow | null; error?: string };
      if (!response.ok) {
        setError(json.error || "טעינת הפרופיל נכשלה.");
        setLoading(false);
        return;
      }
      setForm(profileToForm(json.profile ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת הפרופיל נכשלה.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchForm = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setSuccess(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!userId || saving) return;
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("יש למלא שם פרטי ושם משפחה.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/sitter/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          birth_date: form.birth_date || null,
          show_age: form.show_age,
          show_full_name: form.show_full_name,
          id_number: form.id_number.trim() || null,
          address_full: form.address_full.trim() || null,
          citizenship_israeli: form.citizenship_israeli,
          birth_country: form.birth_country.trim() || null,
          aliyah_year: form.aliyah_year.trim() ? Number(form.aliyah_year) : null,
          military_service: militaryToPayload(form.military_service),
          years_experience: form.years_experience.trim() ? Number(form.years_experience) : null,
          hourly_rate_nis: form.hourly_rate_nis.trim() ? Number(form.hourly_rate_nis) : null,
          preferred_ages: form.preferred_ages.trim() || null,
          languages: form.languages.trim() || null,
          has_car: form.has_car,
          homework_help: form.homework_help,
          light_cooking: form.light_cooking,
          bio: form.bio.trim() || null,
          referee_phone_1: form.referee_phone_1.trim() || null,
          referee_phone_2: form.referee_phone_2.trim() || null,
          legal_no_criminal_declaration: form.legal_no_criminal_declaration,
          working_cities: form.working_cities
        })
      });

      const json = (await response.json()) as { profile?: SitterProfileRow | null; error?: string };
      if (!response.ok) {
        setError(json.error || "שמירת הפרופיל נכשלה.");
        setSaving(false);
        return;
      }

      setForm(profileToForm(json.profile ?? null));
      setSuccess("הפרופיל עודכן בהצלחה");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת הפרופיל נכשלה.");
    } finally {
      setSaving(false);
    }
  }, [form, saving, userId]);

  if (!userId) return null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm">טוען את האזור האישי…</p>
      </div>
    );
  }

  const displayName =
    formatSitterDisplayName({ first_name: form.first_name, last_name: form.last_name }) ||
    "הפרופיל שלי";

  return (
    <div className="space-y-4 pb-4" dir="rtl">
      <section className="rounded-2xl border border-[#C5A059]/25 bg-gradient-to-l from-[#FFF8EA] to-white p-4 shadow-soft">
        <p className="text-xs font-semibold text-[#B8860B]">אזור אישי · שמרטפית</p>
        <h2 className="mt-1 text-lg font-extrabold text-[#001F3F]">{displayName}</h2>
        {form.nanny_serial ? (
          <p className="mt-1 font-mono text-xs font-semibold text-slate-500" dir="ltr">
            {form.nanny_serial}
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <PersonalAreaSection title="פרטים אישיים" description="הפרטים שנשמרו בשאלון ופרופיל מקצועי">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PersonalField label="שם פרטי *">
            <input
              className={personalInputClassName}
              value={form.first_name}
              onChange={(e) => patchForm({ first_name: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="שם משפחה *">
            <input
              className={personalInputClassName}
              value={form.last_name}
              onChange={(e) => patchForm({ last_name: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="תאריך לידה">
            <input
              type="date"
              className={personalInputClassName}
              value={form.birth_date}
              onChange={(e) => patchForm({ birth_date: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="תעודת זהות">
            <input
              className={personalInputClassName}
              value={form.id_number}
              onChange={(e) => patchForm({ id_number: e.target.value })}
              dir="ltr"
            />
          </PersonalField>
          <PersonalField label="כתובת מלאה" className="sm:col-span-2">
            <input
              className={personalInputClassName}
              value={form.address_full}
              onChange={(e) => patchForm({ address_full: e.target.value })}
              placeholder="רחוב, מספר, עיר"
            />
          </PersonalField>
        </div>
        <div className="mt-3 space-y-2">
          <PersonalCheckbox
            checked={form.show_full_name}
            onChange={(next) => patchForm({ show_full_name: next })}
            label="הצג שם מלא להורים"
          />
          <PersonalCheckbox
            checked={form.show_age}
            onChange={(next) => patchForm({ show_age: next })}
            label="הצג גיל להורים"
          />
        </div>
      </PersonalAreaSection>

      <PersonalAreaSection title="רקע מקצועי" accent="emerald">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PersonalField label="שנות ניסיון">
            <input
              type="number"
              min={0}
              className={personalInputClassName}
              value={form.years_experience}
              onChange={(e) => patchForm({ years_experience: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="תעריף שעתי (₪)">
            <input
              type="number"
              min={0}
              className={personalInputClassName}
              value={form.hourly_rate_nis}
              onChange={(e) => patchForm({ hourly_rate_nis: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="שירות צבאי / לאומי">
            <select
              className={personalInputClassName}
              value={form.military_service}
              onChange={(e) => patchForm({ military_service: e.target.value })}
            >
              <option value="כן">כן</option>
              <option value="לא">לא</option>
            </select>
          </PersonalField>
          <PersonalField label="גילאים מועדפים">
            <input
              className={personalInputClassName}
              value={form.preferred_ages}
              onChange={(e) => patchForm({ preferred_ages: e.target.value })}
              placeholder="לדוגמה: 0–3, 4–8"
            />
          </PersonalField>
          <PersonalField label="שפות" className="sm:col-span-2">
            <input
              className={personalInputClassName}
              value={form.languages}
              onChange={(e) => patchForm({ languages: e.target.value })}
              placeholder="עברית, אנגלית…"
            />
          </PersonalField>
          <PersonalField label="אזרחות ישראלית">
            <select
              className={personalInputClassName}
              value={
                form.citizenship_israeli === true
                  ? "yes"
                  : form.citizenship_israeli === false
                    ? "no"
                    : ""
              }
              onChange={(e) =>
                patchForm({
                  citizenship_israeli:
                    e.target.value === "yes" ? true : e.target.value === "no" ? false : null
                })
              }
            >
              <option value="">לא צוין</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
          </PersonalField>
          <PersonalField label="ארץ לידה">
            <input
              className={personalInputClassName}
              value={form.birth_country}
              onChange={(e) => patchForm({ birth_country: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="שנת עלייה">
            <input
              type="number"
              min={1900}
              max={2100}
              className={personalInputClassName}
              value={form.aliyah_year}
              onChange={(e) => patchForm({ aliyah_year: e.target.value })}
            />
          </PersonalField>
        </div>
        <div className="mt-3 space-y-2">
          <PersonalCheckbox
            checked={form.has_car}
            onChange={(next) => patchForm({ has_car: next })}
            label="יש לי רכב / הגעה עצמאית"
          />
          <PersonalCheckbox
            checked={form.homework_help}
            onChange={(next) => patchForm({ homework_help: next })}
            label="עזרה בשיעורי בית"
          />
          <PersonalCheckbox
            checked={form.light_cooking}
            onChange={(next) => patchForm({ light_cooking: next })}
            label="בישול קל"
          />
        </div>
      </PersonalAreaSection>

      <PersonalAreaSection title="אודותיי" accent="sky" description="הטקסט שההורים רואים בכרטיס שלך">
        <PersonalField label="ביוגרפיה קצרה">
          <textarea
            className={personalTextareaClassName}
            value={form.bio}
            onChange={(e) => patchForm({ bio: e.target.value })}
            placeholder="ספרי קצת על עצמך, על הניסיון ועל הגישה שלך לילדים…"
          />
        </PersonalField>
      </PersonalAreaSection>

      <PersonalAreaSection title="אזורי שירות" description="הערים שבהן את מוכנה לעבוד — נשמרות יחד עם שאר הפרטים">
        <IsraelCitiesMultiSelect
          value={form.working_cities}
          onChange={(cities) => patchForm({ working_cities: cities })}
          label="בחרו ערים"
        />
      </PersonalAreaSection>

      <PersonalAreaSection title="אנשי קשר ממליצים" accent="gold">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PersonalField label="טלפון ממליץ 1">
            <input
              type="tel"
              className={personalInputClassName}
              value={form.referee_phone_1}
              onChange={(e) => patchForm({ referee_phone_1: e.target.value })}
              dir="ltr"
            />
          </PersonalField>
          <PersonalField label="טלפון ממליץ 2">
            <input
              type="tel"
              className={personalInputClassName}
              value={form.referee_phone_2}
              onChange={(e) => patchForm({ referee_phone_2: e.target.value })}
              dir="ltr"
            />
          </PersonalField>
        </div>
        <div className="mt-3">
          <PersonalCheckbox
            checked={form.legal_no_criminal_declaration}
            onChange={(next) => patchForm({ legal_no_criminal_declaration: next })}
            label="אני מצהירה שאין לי עבר פלילי רלוונטי"
          />
        </div>
      </PersonalAreaSection>

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#001F3F] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#003366] disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {saving ? "שומר…" : "שמירת שינויים"}
      </button>

      <SitterBankDetailsSection sitterId={userId} />
    </div>
  );
}
