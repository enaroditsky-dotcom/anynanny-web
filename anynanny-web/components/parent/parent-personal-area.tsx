"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import {
  PersonalAreaSection,
  PersonalCheckbox,
  PersonalField,
  personalInputClassName
} from "@/components/personal-area/personal-area-ui";
import type { IsraelCity } from "@/lib/geo/israel-cities";
import {
  buildParentProfileUpdatePayload,
  createEmptyChild,
  createEmptySpecialEvent,
  emptyParentSpouse,
  parseParentProfileRow,
  PARENT_PROFILE_SELECT_FALLBACKS,
  type ParentProfileData
} from "@/lib/parent/parent-profile";
import { fetchProfilePublicId } from "@/lib/public/sequential-display-id";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export function ParentPersonalArea() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [form, setForm] = useState<ParentProfileData | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא מוגדר.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/auth/login?next=/parent/profile");
      return;
    }

    let profileRow: unknown = null;
    let lastError: string | null = null;

    for (const select of PARENT_PROFILE_SELECT_FALLBACKS) {
      const { data, error: readError } = await supabase
        .from(PROFILES_TABLE)
        .select(select)
        .eq("id", user.id)
        .maybeSingle();

      if (!readError) {
        profileRow = data;
        lastError = null;
        break;
      }

      lastError = readError.message;
      if (!isPostgrestSchemaDriftError(readError.message)) {
        break;
      }
    }

    if (lastError && !profileRow) {
      setError(lastError);
      setLoading(false);
      return;
    }

    const parsed = parseParentProfileRow(profileRow, user.id);
    if (!parsed.phone && typeof user.phone === "string" && user.phone.trim()) {
      parsed.phone = user.phone.trim();
    }

    const { publicId: displayId } = await fetchProfilePublicId(supabase, user.id, "parent");
    setPublicId(displayId);
    setForm(parsed);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateForm = useCallback((patch: Partial<ParentProfileData>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setSuccess(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form || saving) return;
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("יש למלא שם פרטי ושם משפחה.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא מוגדר.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = buildParentProfileUpdatePayload(form);
    const attempts = [payload];

    // Graceful degradation if older DBs are missing optional columns.
    attempts.push({
      first_name: payload.first_name,
      last_name: payload.last_name,
      birth_date: payload.birth_date,
      address: payload.address,
      spouse: payload.spouse,
      wedding_date: payload.wedding_date,
      children: payload.children,
      special_events: payload.special_events
    });
    attempts.push({
      first_name: payload.first_name,
      last_name: payload.last_name,
      birth_date: payload.birth_date,
      address: payload.address,
      children: payload.children
    });
    attempts.push({
      first_name: payload.first_name,
      last_name: payload.last_name,
      address: payload.address
    });

    let saveError: string | null = null;
    for (const attempt of attempts) {
      const { error: updateError } = await supabase
        .from(PROFILES_TABLE)
        .update(attempt)
        .eq("id", form.id);

      if (!updateError) {
        saveError = null;
        break;
      }

      saveError = updateError.message;
      if (!isPostgrestSchemaDriftError(updateError.message)) {
        break;
      }
    }

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }

    setSuccess("הפרטים נשמרו בהצלחה");
    await load();
  }, [form, load, saving]);

  if (loading || !form) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm">טוען את האזור האישי…</p>
      </div>
    );
  }

  const selectedCity = (form.address.city ? [form.address.city] : []) as IsraelCity[];
  const hasSpouse = Boolean(form.spouse);

  return (
    <div className="space-y-4 pb-4" dir="rtl">
      <section className="rounded-2xl border border-[#C5A059]/25 bg-gradient-to-l from-[#FFF8EA] to-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold text-[#B8860B]">אזור אישי · הורה</p>
            <h2 className="mt-1 text-lg font-extrabold text-[#001F3F]">
              {`${form.first_name} ${form.last_name}`.trim() || "הפרופיל שלי"}
            </h2>
            {publicId ? (
              <p className="mt-1 font-mono text-xs font-semibold text-slate-500" dir="ltr">
                {publicId}
              </p>
            ) : null}
          </div>
          <Link
            href="/parent/wallet"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
          >
            <Wallet className="h-3.5 w-3.5" />
            ארנק
          </Link>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <PersonalAreaSection title="פרטים אישיים" description="הפרטים שנשמרו בשאלון ההרשמה">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PersonalField label="שם פרטי *">
            <input
              className={personalInputClassName}
              value={form.first_name}
              onChange={(e) => updateForm({ first_name: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="שם משפחה *">
            <input
              className={personalInputClassName}
              value={form.last_name}
              onChange={(e) => updateForm({ last_name: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="תאריך לידה">
            <input
              type="date"
              className={personalInputClassName}
              value={form.birth_date}
              onChange={(e) => updateForm({ birth_date: e.target.value })}
            />
          </PersonalField>
          <PersonalField label="טלפון">
            <input
              type="tel"
              className={personalInputClassName}
              value={form.phone}
              onChange={(e) => updateForm({ phone: e.target.value })}
              placeholder="05X-XXXXXXX"
              dir="ltr"
            />
          </PersonalField>
        </div>
      </PersonalAreaSection>

      <PersonalAreaSection title="כתובת מגורים" accent="sky" description="הכתובת שמוצגת לשמרטפית במשמרות מאושרות">
        <div className="space-y-3">
          <PersonalField label="עיר *">
            <IsraelCitiesMultiSelect
              value={selectedCity}
              onChange={(cities) =>
                updateForm({
                  address: { ...form.address, city: cities[cities.length - 1] || "" }
                })
              }
              label="בחרו עיר"
            />
          </PersonalField>
          <div className="grid grid-cols-3 gap-2">
            <PersonalField label="רחוב *" className="col-span-2">
              <input
                className={personalInputClassName}
                value={form.address.street}
                onChange={(e) =>
                  updateForm({ address: { ...form.address, street: e.target.value } })
                }
              />
            </PersonalField>
            <PersonalField label="מס׳ בית *">
              <input
                className={personalInputClassName}
                value={form.address.houseNumber}
                onChange={(e) =>
                  updateForm({ address: { ...form.address, houseNumber: e.target.value } })
                }
              />
            </PersonalField>
          </div>
        </div>
      </PersonalAreaSection>

      <PersonalAreaSection title="בן/בת זוג ויום נישואין" accent="gold">
        <div className="space-y-3">
          <PersonalCheckbox
            checked={hasSpouse}
            label="יש בן/בת זוג"
            onChange={(next) => updateForm({ spouse: next ? form.spouse ?? emptyParentSpouse() : null })}
          />
          {hasSpouse && form.spouse ? (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#C5A059]/20 bg-[#FFFCF5] p-3 sm:grid-cols-2">
              <PersonalField label="שם פרטי">
                <input
                  className={personalInputClassName}
                  value={form.spouse.firstName}
                  onChange={(e) =>
                    updateForm({ spouse: { ...form.spouse!, firstName: e.target.value } })
                  }
                />
              </PersonalField>
              <PersonalField label="שם משפחה">
                <input
                  className={personalInputClassName}
                  value={form.spouse.lastName}
                  onChange={(e) =>
                    updateForm({ spouse: { ...form.spouse!, lastName: e.target.value } })
                  }
                />
              </PersonalField>
              <PersonalField label="תאריך לידה" className="sm:col-span-2">
                <input
                  type="date"
                  className={personalInputClassName}
                  value={form.spouse.birthDate}
                  onChange={(e) =>
                    updateForm({ spouse: { ...form.spouse!, birthDate: e.target.value } })
                  }
                />
              </PersonalField>
            </div>
          ) : null}
          <PersonalField label="יום נישואין">
            <input
              type="date"
              className={personalInputClassName}
              value={form.wedding_date}
              onChange={(e) => updateForm({ wedding_date: e.target.value })}
            />
          </PersonalField>
        </div>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="ילדים"
        accent="emerald"
        description="ימי הולדת של הילדים לפינוקים ותזכורות"
      >
        <div className="space-y-2">
          {form.children.length === 0 ? (
            <p className="text-xs italic text-slate-500">עדיין לא נוספו ילדים.</p>
          ) : (
            form.children.map((child, index) => (
              <div
                key={child.id}
                className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5"
              >
                <input
                  className={personalInputClassName}
                  value={child.name}
                  placeholder={`שם ילד/ה ${index + 1}`}
                  onChange={(e) =>
                    updateForm({
                      children: form.children.map((item) =>
                        item.id === child.id ? { ...item, name: e.target.value } : item
                      )
                    })
                  }
                />
                <input
                  type="date"
                  className={personalInputClassName}
                  value={child.birthDate}
                  onChange={(e) =>
                    updateForm({
                      children: form.children.map((item) =>
                        item.id === child.id ? { ...item, birthDate: e.target.value } : item
                      )
                    })
                  }
                />
                <button
                  type="button"
                  className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50"
                  onClick={() =>
                    updateForm({ children: form.children.filter((item) => item.id !== child.id) })
                  }
                  aria-label="הסר ילד"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => updateForm({ children: [...form.children, createEmptyChild()] })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#001F3F] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#003366]"
          >
            <Plus className="h-3.5 w-3.5" />
            הוסף ילד
          </button>
        </div>
      </PersonalAreaSection>

      <PersonalAreaSection title="אירועים מיוחדים לפינוק" accent="gold">
        <div className="space-y-2">
          {form.special_events.length === 0 ? (
            <p className="text-xs italic text-slate-500">לדוגמה: יום הולדת לחבר, ציון דרך משפחתי.</p>
          ) : (
            form.special_events.map((event) => (
              <div
                key={event.id}
                className="space-y-2 rounded-xl border border-[#C5A059]/25 bg-[#FFFCF5] p-2.5"
              >
                <div className="flex items-center gap-2">
                  <input
                    className={personalInputClassName}
                    value={event.title}
                    placeholder="תיאור האירוע"
                    onChange={(e) =>
                      updateForm({
                        special_events: form.special_events.map((item) =>
                          item.id === event.id ? { ...item, title: e.target.value } : item
                        )
                      })
                    }
                  />
                  <button
                    type="button"
                    className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50"
                    onClick={() =>
                      updateForm({
                        special_events: form.special_events.filter((item) => item.id !== event.id)
                      })
                    }
                    aria-label="הסר אירוע"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="date"
                  className={personalInputClassName}
                  value={event.date}
                  onChange={(e) =>
                    updateForm({
                      special_events: form.special_events.map((item) =>
                        item.id === event.id ? { ...item, date: e.target.value } : item
                      )
                    })
                  }
                />
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() =>
              updateForm({ special_events: [...form.special_events, createEmptySpecialEvent()] })
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#B8860B] px-3 py-2 text-xs font-bold text-white transition hover:bg-yellow-700"
          >
            <Plus className="h-3.5 w-3.5" />
            הוסף אירוע
          </button>
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
    </div>
  );
}
