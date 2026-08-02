"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import {
  PersonalAreaSection,
  PersonalChangeLink,
  PersonalCheckbox,
  PersonalEditModal,
  PersonalField,
  PersonalStaticRow,
  formatDisplayDate,
  personalInputClassName,
  personalTextareaClassName,
  yesNoLabel
} from "@/components/personal-area/personal-area-ui";
import { SitterBankDetailsSection } from "@/components/sitter/SitterBankDetailsSection";
import { ExpertRegistrationFields } from "@/components/sitter/expert-registration-fields";
import { EXPERT_SERVICE_VISUALS } from "@/components/sitter/expert-service-icons";
import type { IsraelCity } from "@/lib/geo/israel-cities";
import { normalizeWorkingCities } from "@/lib/geo/israel-cities";
import {
  expertDraftToProfilePatch,
  EXPERT_BIO_MAX_LENGTH,
  isExpertOnlyServiceKind,
  normalizeExpertServiceTypes,
  normalizePricingModel,
  normalizeServiceLocations,
  SERVICE_LOCATION_OPTIONS,
  validateExpertProfileDraft,
  type ExpertProfileDraft
} from "@/lib/sitter/expert-profile";
import {
  formatPreferredAgesDisplay,
  formatPreferredAgesRange,
  formatSitterDisplayName,
  formatSitterLanguagesDisplay,
  normalizePreferredAges,
  normalizeSitterLanguages,
  parsePreferredAges,
  PREFERRED_AGE_MAX,
  PREFERRED_AGE_MIN,
  SITTER_LANGUAGE_OPTIONS,
  type SitterLanguage,
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
  package_price_nis: string;
  pricing_model: "hourly" | "package";
  service_type: ExpertProfileDraft["serviceType"] | "babysitter";
  service_locations: ExpertProfileDraft["serviceLocations"];
  certifications: string;
  preferred_ages: string;
  languages: SitterLanguage[];
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

type EditKey =
  | "first_name"
  | "last_name"
  | "birth_date"
  | "id_number"
  | "address_full"
  | "years_experience"
  | "hourly_rate_nis"
  | "military_service"
  | "preferred_ages"
  | "languages"
  | "citizenship_israeli"
  | "birth_country"
  | "aliyah_year"
  | "bio"
  | "referee_phone_1"
  | "referee_phone_2"
  | "working_cities"
  | "visibility"
  | "skills"
  | "legal"
  | "expert_profile";

function formToExpertDraft(form: FormState): ExpertProfileDraft {
  const serviceType = isExpertOnlyServiceKind(form.service_type)
    ? form.service_type
    : "lactation_consultant";
  return {
    serviceType,
    serviceLocations: form.service_locations,
    pricingModel: form.pricing_model,
    hourlyRateNis: form.hourly_rate_nis,
    packagePriceNis: form.package_price_nis,
    bio: form.bio,
    certifications: form.certifications
  };
}

function isExpertForm(form: FormState): boolean {
  return isExpertOnlyServiceKind(form.service_type);
}

function militaryToForm(value: unknown): string {
  if (value === true || value === "true" || value === "כן") return "כן";
  if (value === false || value === "false" || value === "לא") return "לא";
  if (typeof value === "string" && value.trim()) return value.trim();
  return "כן";
}

function militaryToPayload(value: string): string {
  return value === "לא" ? "לא" : "כן";
}

function toggleLanguage(current: readonly SitterLanguage[], language: SitterLanguage): SitterLanguage[] {
  const selected = normalizeSitterLanguages(current);
  return selected.includes(language)
    ? selected.filter((item) => item !== language)
    : normalizeSitterLanguages([...selected, language]);
}

const PREFERRED_AGE_OPTIONS = Array.from(
  { length: PREFERRED_AGE_MAX - PREFERRED_AGE_MIN + 1 },
  (_, index) => PREFERRED_AGE_MIN + index
);

function PreferredAgesEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parsePreferredAges(value);
  const minAge = parsed?.min ?? 1;
  const maxAge = parsed?.max ?? 12;
  const current = formatPreferredAgesRange(minAge, maxAge);

  return (
    <div className="space-y-3 text-right">
      <div className="grid grid-cols-2 gap-3">
        <PersonalField label="מגיל">
          <select
            className={personalInputClassName}
            value={minAge}
            onChange={(e) => {
              const nextMin = Number(e.target.value);
              onChange(formatPreferredAgesRange(nextMin, Math.max(nextMin, maxAge)));
            }}
          >
            {PREFERRED_AGE_OPTIONS.map((age) => (
              <option key={`min-${age}`} value={age}>
                {age}
              </option>
            ))}
          </select>
        </PersonalField>
        <PersonalField label="עד גיל">
          <select
            className={personalInputClassName}
            value={maxAge}
            onChange={(e) => {
              const nextMax = Number(e.target.value);
              onChange(formatPreferredAgesRange(Math.min(minAge, nextMax), nextMax));
            }}
          >
            {PREFERRED_AGE_OPTIONS.map((age) => (
              <option key={`max-${age}`} value={age}>
                {age}
              </option>
            ))}
          </select>
        </PersonalField>
      </div>

      <p className="text-[12px] text-slate-500">
        יוצג בפרופיל כ־<span className="font-semibold text-[#001F3F]" dir="ltr">{current}</span>
      </p>
    </div>
  );
}

function profileToForm(profile: SitterProfileRow | null): FormState {
  const types = normalizeExpertServiceTypes(profile?.service_types);
  const primary = types.find((t) => isExpertOnlyServiceKind(t)) ?? types[0] ?? "babysitter";
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
    package_price_nis: profile?.package_price_nis != null ? String(profile.package_price_nis) : "",
    pricing_model: normalizePricingModel(profile?.pricing_model),
    service_type: primary,
    service_locations: normalizeServiceLocations(profile?.service_locations),
    certifications: profile?.certifications ?? "",
    preferred_ages: formatPreferredAgesDisplay(profile?.preferred_ages),
    languages: normalizeSitterLanguages(profile?.languages),
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

function formToPayload(form: FormState): Record<string, unknown> {
  const base: Record<string, unknown> = {
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
    preferred_ages: normalizePreferredAges(form.preferred_ages),
    languages: normalizeSitterLanguages(form.languages),
    has_car: form.has_car,
    homework_help: form.homework_help,
    light_cooking: form.light_cooking,
    bio: form.bio.trim().slice(0, EXPERT_BIO_MAX_LENGTH) || null,
    referee_phone_1: form.referee_phone_1.trim() || null,
    referee_phone_2: form.referee_phone_2.trim() || null,
    working_cities: form.working_cities
  };

  if (isExpertForm(form)) {
    Object.assign(base, expertDraftToProfilePatch(formToExpertDraft(form)));
  } else {
    base.service_types = ["babysitter"];
    base.pricing_model = "hourly";
    base.hourly_rate_nis = form.hourly_rate_nis.trim() ? Number(form.hourly_rate_nis) : null;
    base.package_price_nis = null;
    base.service_locations = [];
    base.certifications = form.certifications.trim() || null;
  }

  return base;
}

type Props = {
  userId: string | null;
};

export function SitterPersonalArea({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(profileToForm(null));
  const [editKey, setEditKey] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState<FormState>(profileToForm(null));

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

  const openEdit = useCallback(
    (key: EditKey) => {
      setModalError(null);
      setSuccess(null);
      setDraft({
        ...form,
        working_cities: [...form.working_cities],
        languages: [...form.languages],
        service_locations: [...form.service_locations],
        preferred_ages:
          key === "preferred_ages"
            ? formatPreferredAgesDisplay(form.preferred_ages) || formatPreferredAgesRange(1, 12)
            : form.preferred_ages
      });
      setEditKey(key);
    },
    [form]
  );

  const closeEdit = useCallback(() => {
    if (saving) return;
    setEditKey(null);
    setModalError(null);
  }, [saving]);

  const handleSave = useCallback(async () => {
    if (!userId || !editKey) return;

    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setModalError("יש למלא שם פרטי ושם משפחה.");
      return;
    }

    if (editKey === "working_cities" && draft.working_cities.length === 0) {
      setModalError("יש לבחור לפחות עיר אחת.");
      return;
    }

    if (editKey === "expert_profile" || (editKey === "bio" && isExpertForm(draft))) {
      const expertError = validateExpertProfileDraft(formToExpertDraft(draft));
      if (expertError) {
        setModalError(expertError);
        return;
      }
    }

    setSaving(true);
    setModalError(null);

    try {
      const next = { ...form, ...draft };
      const response = await fetch("/api/sitter/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(next))
      });
      const json = (await response.json()) as { profile?: SitterProfileRow | null; error?: string };
      if (!response.ok) {
        setModalError(json.error || "שמירת הפרופיל נכשלה.");
        setSaving(false);
        return;
      }

      setForm(profileToForm(json.profile ?? null));
      setEditKey(null);
      setSuccess("הפרטים עודכנו בהצלחה");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "שמירת הפרופיל נכשלה.");
    } finally {
      setSaving(false);
    }
  }, [draft, editKey, form, userId]);

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

  const skillsLabel = [
    form.has_car ? "רכב / הגעה עצמאית" : null,
    form.homework_help ? "עזרה בשיעורים" : null,
    form.light_cooking ? "בישול קל" : null
  ]
    .filter(Boolean)
    .join(" · ");

  const visibilityLabel = [
    form.show_full_name ? "שם מלא מוצג" : "שם מלא מוסתר",
    form.show_age ? "גיל מוצג" : "גיל מוסתר"
  ].join(" · ");

  const modalTitle =
    editKey === "first_name"
      ? "שינוי שם פרטי"
      : editKey === "last_name"
        ? "שינוי שם משפחה"
        : editKey === "birth_date"
          ? "שינוי תאריך לידה"
          : editKey === "id_number"
            ? "שינוי תעודת זהות"
            : editKey === "address_full"
              ? "שינוי כתובת"
              : editKey === "years_experience"
                ? "שינוי שנות ניסיון"
                : editKey === "hourly_rate_nis"
                  ? "שינוי תעריף שעתי"
                  : editKey === "military_service"
                    ? "שינוי שירות צבאי / לאומי"
                    : editKey === "preferred_ages"
                      ? "שינוי גילאים מועדפים"
                      : editKey === "languages"
                        ? "שינוי שפות"
                        : editKey === "citizenship_israeli"
                          ? "שינוי אזרחות"
                          : editKey === "birth_country"
                            ? "שינוי ארץ לידה"
                            : editKey === "aliyah_year"
                              ? "שינוי שנת עלייה"
                              : editKey === "bio"
                                ? "שינוי אודותיי"
                                : editKey === "referee_phone_1"
                                  ? "שינוי טלפון ממליץ 1"
                                  : editKey === "referee_phone_2"
                                    ? "שינוי טלפון ממליץ 2"
                                    : editKey === "working_cities"
                                      ? "שינוי אזורי שירות"
                                      : editKey === "visibility"
                                        ? "שינוי הגדרות תצוגה"
                                        : editKey === "skills"
                                          ? "שינוי כישורים"
                                          : editKey === "legal"
                                            ? "שינוי הצהרה"
                                            : editKey === "expert_profile"
                                              ? "שינוי פרופיל מקצועי"
                                              : "";

  const expert = isExpertForm(form);
  const priceLabel =
    form.pricing_model === "package"
      ? form.package_price_nis
        ? `₪${form.package_price_nis} · חבילה`
        : ""
      : form.hourly_rate_nis
        ? `₪${form.hourly_rate_nis} · שעתי`
        : "";
  const locationsLabel = form.service_locations
    .map((id) => SERVICE_LOCATION_OPTIONS.find((o) => o.id === id)?.labelHe)
    .filter(Boolean)
    .join(" · ");
  const serviceTypeLabel =
    form.service_type in EXPERT_SERVICE_VISUALS
      ? EXPERT_SERVICE_VISUALS[form.service_type as keyof typeof EXPERT_SERVICE_VISUALS].labelHe
      : "";

  return (
    <div className="space-y-4 pb-4" dir="rtl">
      <section className="rounded-2xl border border-[#C5A059]/25 bg-gradient-to-l from-[#FFF8EA] to-white p-4 shadow-soft">
        <p className="text-xs font-semibold text-[#B8860B]">
          {expert ? "אזור אישי · יועצת / דולה" : "אזור אישי · שמרטפית"}
        </p>
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
        <PersonalStaticRow label="שם פרטי" value={form.first_name} onEdit={() => openEdit("first_name")} />
        <PersonalStaticRow label="שם משפחה" value={form.last_name} onEdit={() => openEdit("last_name")} />
        <PersonalStaticRow
          label="תאריך לידה"
          value={formatDisplayDate(form.birth_date)}
          onEdit={() => openEdit("birth_date")}
        />
        <PersonalStaticRow
          label="תעודת זהות"
          value={form.id_number}
          onEdit={() => openEdit("id_number")}
          dir="ltr"
        />
        <PersonalStaticRow
          label="כתובת מלאה"
          value={form.address_full}
          onEdit={() => openEdit("address_full")}
        />
      </PersonalAreaSection>

      <PersonalAreaSection
        title="הגדרות תצוגה"
        accent="sky"
        action={<PersonalChangeLink onClick={() => openEdit("visibility")} />}
      >
        <p className="text-[14px] font-medium text-[#001F3F]">{visibilityLabel}</p>
      </PersonalAreaSection>

      <PersonalAreaSection title="רקע מקצועי" accent="emerald">
        {!expert ? (
          <PersonalStaticRow
            label="שנות ניסיון"
            value={form.years_experience}
            onEdit={() => openEdit("years_experience")}
          />
        ) : null}
        <PersonalStaticRow
          label={expert ? "תמחור" : "תעריף שעתי"}
          value={priceLabel || (form.hourly_rate_nis ? `₪${form.hourly_rate_nis}` : "")}
          onEdit={() => openEdit(expert ? "expert_profile" : "hourly_rate_nis")}
        />
        {!expert ? (
          <PersonalStaticRow
            label="שירות צבאי / לאומי"
            value={form.military_service}
            onEdit={() => openEdit("military_service")}
          />
        ) : null}
        <PersonalStaticRow
          label="גילאים מועדפים"
          value={formatPreferredAgesDisplay(form.preferred_ages)}
          onEdit={() => openEdit("preferred_ages")}
        />
        <PersonalStaticRow
          label="שפות"
          value={formatSitterLanguagesDisplay(form.languages)}
          onEdit={() => openEdit("languages")}
        />
        <PersonalStaticRow
          label="אזרחות ישראלית"
          value={yesNoLabel(form.citizenship_israeli)}
          onEdit={() => openEdit("citizenship_israeli")}
        />
        <PersonalStaticRow
          label="ארץ לידה"
          value={form.birth_country}
          onEdit={() => openEdit("birth_country")}
        />
        <PersonalStaticRow
          label="שנת עלייה"
          value={form.aliyah_year}
          onEdit={() => openEdit("aliyah_year")}
        />
      </PersonalAreaSection>

      {expert ? (
        <PersonalAreaSection
          title="שירות מקצועי"
          accent="emerald"
          description="סוג השירות, מיקום השירות והסמכות"
          action={<PersonalChangeLink onClick={() => openEdit("expert_profile")} />}
        >
          <div className="space-y-2 text-[14px] font-medium text-[#001F3F]">
            <p>{serviceTypeLabel || "לא נבחר סוג שירות"}</p>
            <p className={locationsLabel ? "" : "italic text-slate-400"}>
              {locationsLabel || "לא נבחרו מיקומי שירות"}
            </p>
            <p
              className={`whitespace-pre-wrap ${
                form.certifications.trim() ? "" : "italic text-slate-400"
              }`}
            >
              {form.certifications.trim() || "לא הוגדרו הסמכות"}
            </p>
          </div>
        </PersonalAreaSection>
      ) : null}

      <PersonalAreaSection
        title="כישורים"
        accent="emerald"
        action={<PersonalChangeLink onClick={() => openEdit("skills")} />}
      >
        <p className={`text-[14px] ${skillsLabel ? "font-medium text-[#001F3F]" : "italic text-slate-400"}`}>
          {skillsLabel || "לא הוגדרו כישורים נוספים"}
        </p>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="אודותיי"
        accent="sky"
        description="הטקסט שההורים רואים בכרטיס שלך"
        action={<PersonalChangeLink onClick={() => openEdit("bio")} />}
      >
        <p
          className={`whitespace-pre-wrap text-[14px] leading-relaxed ${
            form.bio.trim() ? "font-medium text-[#001F3F]" : "italic text-slate-400"
          }`}
        >
          {form.bio.trim() || "לא הוגדר"}
        </p>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="אזורי שירות"
        description="הערים שבהן את מוכנה לעבוד"
        action={<PersonalChangeLink onClick={() => openEdit("working_cities")} />}
      >
        <p
          className={`text-[14px] leading-relaxed ${
            form.working_cities.length ? "font-medium text-[#001F3F]" : "italic text-slate-400"
          }`}
        >
          {form.working_cities.length ? form.working_cities.join(", ") : "לא הוגדרו אזורי שירות"}
        </p>
      </PersonalAreaSection>

      <PersonalAreaSection title="אנשי קשר ממליצים" accent="gold">
        <PersonalStaticRow
          label="טלפון ממליץ 1"
          value={form.referee_phone_1}
          onEdit={() => openEdit("referee_phone_1")}
          dir="ltr"
        />
        <PersonalStaticRow
          label="טלפון ממליץ 2"
          value={form.referee_phone_2}
          onEdit={() => openEdit("referee_phone_2")}
          dir="ltr"
        />
      </PersonalAreaSection>

      <PersonalAreaSection
        title="הצהרה"
        accent="gold"
        action={<PersonalChangeLink onClick={() => openEdit("legal")} />}
      >
        <p className="text-[14px] font-medium text-[#001F3F]">
          {form.legal_no_criminal_declaration
            ? "הצהרת היעדר עבר פלילי רלוונטי אושרה"
            : "הצהרה טרם אושרה"}
        </p>
      </PersonalAreaSection>

      <SitterBankDetailsSection sitterId={userId} />

      <PersonalEditModal
        open={editKey != null}
        title={modalTitle}
        onClose={closeEdit}
        onSave={handleSave}
        saving={saving}
        error={modalError}
      >
        {editKey === "first_name" ||
        editKey === "last_name" ||
        editKey === "id_number" ||
        editKey === "address_full" ||
        editKey === "birth_country" ||
        editKey === "referee_phone_1" ||
        editKey === "referee_phone_2" ? (
          <PersonalField label={modalTitle.replace("שינוי ", "")}>
            <input
              className={personalInputClassName}
              value={
                editKey === "first_name"
                  ? draft.first_name
                  : editKey === "last_name"
                    ? draft.last_name
                    : editKey === "id_number"
                      ? draft.id_number
                      : editKey === "address_full"
                        ? draft.address_full
                        : editKey === "birth_country"
                          ? draft.birth_country
                          : editKey === "referee_phone_1"
                            ? draft.referee_phone_1
                            : draft.referee_phone_2
              }
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  [editKey]: e.target.value
                }))
              }
              dir={
                editKey === "id_number" ||
                editKey === "referee_phone_1" ||
                editKey === "referee_phone_2"
                  ? "ltr"
                  : undefined
              }
              autoFocus
            />
          </PersonalField>
        ) : null}

        {editKey === "preferred_ages" ? (
          <PreferredAgesEditor
            value={draft.preferred_ages}
            onChange={(next) => setDraft((prev) => ({ ...prev, preferred_ages: next }))}
          />
        ) : null}

        {editKey === "languages" ? (
          <PersonalField label="שפות">
            <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="בחירת שפות">
              {SITTER_LANGUAGE_OPTIONS.map((language) => {
                const selected = draft.languages.includes(language);
                return (
                  <button
                    key={language}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        languages: toggleLanguage(prev.languages, language)
                      }))
                    }
                    className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                      selected
                        ? "border-[#001F3F] bg-[#001F3F] text-white"
                        : "border-[#001F3F]/15 bg-white text-[#001F3F] hover:border-[#001F3F]/35 hover:bg-[#FDFBF6]"
                    }`}
                  >
                    {language}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">ניתן לבחור שפה אחת או יותר</p>
          </PersonalField>
        ) : null}

        {editKey === "birth_date" ? (
          <PersonalField label="תאריך לידה">
            <input
              type="date"
              className={personalInputClassName}
              value={draft.birth_date}
              onChange={(e) => setDraft((prev) => ({ ...prev, birth_date: e.target.value }))}
              autoFocus
            />
          </PersonalField>
        ) : null}

        {editKey === "years_experience" ||
        editKey === "hourly_rate_nis" ||
        editKey === "aliyah_year" ? (
          <PersonalField label={modalTitle.replace("שינוי ", "")}>
            <input
              type="number"
              className={personalInputClassName}
              value={
                editKey === "years_experience"
                  ? draft.years_experience
                  : editKey === "hourly_rate_nis"
                    ? draft.hourly_rate_nis
                    : draft.aliyah_year
              }
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  [editKey]: e.target.value
                }))
              }
              autoFocus
            />
          </PersonalField>
        ) : null}

        {editKey === "military_service" ? (
          <PersonalField label="שירות צבאי / לאומי">
            <select
              className={personalInputClassName}
              value={draft.military_service}
              onChange={(e) => setDraft((prev) => ({ ...prev, military_service: e.target.value }))}
            >
              <option value="כן">כן</option>
              <option value="לא">לא</option>
            </select>
          </PersonalField>
        ) : null}

        {editKey === "citizenship_israeli" ? (
          <PersonalField label="אזרחות ישראלית">
            <select
              className={personalInputClassName}
              value={
                draft.citizenship_israeli === true
                  ? "yes"
                  : draft.citizenship_israeli === false
                    ? "no"
                    : ""
              }
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  citizenship_israeli:
                    e.target.value === "yes" ? true : e.target.value === "no" ? false : null
                }))
              }
            >
              <option value="">לא צוין</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
          </PersonalField>
        ) : null}

        {editKey === "bio" ? (
          <PersonalField label="ביוגרפיה מקצועית">
            <textarea
              className={personalTextareaClassName}
              value={draft.bio}
              maxLength={EXPERT_BIO_MAX_LENGTH}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  bio: e.target.value.slice(0, EXPERT_BIO_MAX_LENGTH)
                }))
              }
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {draft.bio.length}/{EXPERT_BIO_MAX_LENGTH}
            </p>
          </PersonalField>
        ) : null}

        {editKey === "expert_profile" ? (
          <ExpertRegistrationFields
            value={formToExpertDraft(draft)}
            onChange={(next) =>
              setDraft((prev) => ({
                ...prev,
                service_type: next.serviceType,
                service_locations: next.serviceLocations,
                pricing_model: next.pricingModel,
                hourly_rate_nis: next.hourlyRateNis,
                package_price_nis: next.packagePriceNis,
                bio: next.bio,
                certifications: next.certifications
              }))
            }
          />
        ) : null}

        {editKey === "working_cities" ? (
          <IsraelCitiesMultiSelect
            value={draft.working_cities}
            onChange={(cities) => setDraft((prev) => ({ ...prev, working_cities: cities }))}
            label="בחרו ערים"
          />
        ) : null}

        {editKey === "visibility" ? (
          <div className="space-y-2">
            <PersonalCheckbox
              checked={draft.show_full_name}
              onChange={(next) => setDraft((prev) => ({ ...prev, show_full_name: next }))}
              label="הצג שם מלא להורים"
            />
            <PersonalCheckbox
              checked={draft.show_age}
              onChange={(next) => setDraft((prev) => ({ ...prev, show_age: next }))}
              label="הצג גיל להורים"
            />
          </div>
        ) : null}

        {editKey === "skills" ? (
          <div className="space-y-2">
            <PersonalCheckbox
              checked={draft.has_car}
              onChange={(next) => setDraft((prev) => ({ ...prev, has_car: next }))}
              label="יש לי רכב / הגעה עצמאית"
            />
            <PersonalCheckbox
              checked={draft.homework_help}
              onChange={(next) => setDraft((prev) => ({ ...prev, homework_help: next }))}
              label="עזרה בשיעורי בית"
            />
            <PersonalCheckbox
              checked={draft.light_cooking}
              onChange={(next) => setDraft((prev) => ({ ...prev, light_cooking: next }))}
              label="בישול קל"
            />
          </div>
        ) : null}

        {editKey === "legal" ? (
          <PersonalCheckbox
            checked={draft.legal_no_criminal_declaration}
            onChange={(next) =>
              setDraft((prev) => ({ ...prev, legal_no_criminal_declaration: next }))
            }
            label="אני מצהירה שאין לי עבר פלילי רלוונטי"
          />
        ) : null}
      </PersonalEditModal>
    </div>
  );
}
