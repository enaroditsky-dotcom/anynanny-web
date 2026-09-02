"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Trash2, User, Wallet } from "lucide-react";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import { WelcomeReplayCard } from "@/components/welcome/welcome-replay-card";
import { IdentityPersonalSection } from "@/components/identity/identity-personal-section";
import { IdentityVerifiedBadgeLive } from "@/components/identity/verified-user-badge";
import {
  PersonalAreaSection,
  PersonalChangeLink,
  PersonalCheckbox,
  PersonalEditModal,
  PersonalField,
  PersonalStaticRow,
  displayOrEmpty,
  formatDisplayDate,
  personalInputClassName
} from "@/components/personal-area/personal-area-ui";
import { getAccountDobEligibilityError } from "@/lib/auth/age-eligibility";
import type { IsraelCity } from "@/lib/geo/israel-cities";
import {
  buildParentProfileUpdatePayload,
  createEmptyChild,
  createEmptySpecialEvent,
  emptyParentSpouse,
  parseParentProfileRow,
  PARENT_PROFILE_SELECT_FALLBACKS,
  type ParentAddress,
  type ParentChild,
  type ParentProfileData,
  type ParentSpecialEvent,
  type ParentSpouse
} from "@/lib/parent/parent-profile";
import { fetchProfilePublicId } from "@/lib/public/sequential-display-id";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { formatParentProfileAddress } from "@/lib/bookings/todays-linked-booking";
import { removeOwnAvatar, uploadOwnAvatar } from "@/lib/profile/avatar-storage";
import {
  formatContactPhoneDisplay,
  requestSaveOwnContactPhone,
  validateContactPhoneInput
} from "@/lib/profile/contact-phone";

type EditKey =
  | "first_name"
  | "last_name"
  | "birth_date"
  | "phone"
  | "avatar"
  | "address"
  | "spouse"
  | "children"
  | "special_events";

export function ParentPersonalArea() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [form, setForm] = useState<ParentProfileData | null>(null);
  const [editKey, setEditKey] = useState<EditKey | null>(null);

  const [draftText, setDraftText] = useState("");
  const [draftAddress, setDraftAddress] = useState<ParentAddress>({
    city: "",
    street: "",
    houseNumber: ""
  });
  const [draftHasSpouse, setDraftHasSpouse] = useState(false);
  const [draftSpouse, setDraftSpouse] = useState<ParentSpouse>(emptyParentSpouse());
  const [draftWeddingDate, setDraftWeddingDate] = useState("");
  const [draftChildren, setDraftChildren] = useState<ParentChild[]>([]);
  const [draftEvents, setDraftEvents] = useState<ParentSpecialEvent[]>([]);
  const [draftAvatarUrl, setDraftAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [authPhone, setAuthPhone] = useState("");

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
      if (!isPostgrestSchemaDriftError(readError.message)) break;
    }

    if (lastError && !profileRow) {
      setError(lastError);
      setLoading(false);
      return;
    }

    const parsed = parseParentProfileRow(profileRow, user.id);
    setAuthPhone(typeof user.phone === "string" ? user.phone.trim() : "");
    const { publicId: displayId } = await fetchProfilePublicId(supabase, user.id, "parent");
    setPublicId(displayId);
    setForm(parsed);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = useCallback(
    (key: EditKey) => {
      if (!form) return;
      setModalError(null);
      setSuccess(null);
      setEditKey(key);

      if (key === "first_name") setDraftText(form.first_name);
      else if (key === "last_name") setDraftText(form.last_name);
      else if (key === "birth_date") setDraftText(form.birth_date);
      else if (key === "phone") setDraftText(form.phone || authPhone);
      else if (key === "address") setDraftAddress({ ...form.address });
      else if (key === "spouse") {
        setDraftHasSpouse(Boolean(form.spouse));
        setDraftSpouse(form.spouse ? { ...form.spouse } : emptyParentSpouse());
        setDraftWeddingDate(form.wedding_date);
      } else if (key === "children") {
        setDraftChildren(form.children.map((child) => ({ ...child })));
      } else if (key === "special_events") {
        setDraftEvents(form.special_events.map((event) => ({ ...event })));
      } else if (key === "avatar") {
        setDraftAvatarUrl(form.avatar_url);
      }
    },
    [form, authPhone]
  );

  const closeEdit = useCallback(() => {
    if (saving || uploadingAvatar) return;
    setEditKey(null);
    setModalError(null);
  }, [saving, uploadingAvatar]);

  const persist = useCallback(
    async (next: ParentProfileData) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setModalError("Supabase לא מוגדר.");
        return false;
      }

      if (!next.first_name.trim() || !next.last_name.trim()) {
        setModalError("יש למלא שם פרטי ושם משפחה.");
        return false;
      }

      setSaving(true);
      setModalError(null);

      const payload = buildParentProfileUpdatePayload(next);
      const attempts = [
        payload,
        {
          first_name: payload.first_name,
          last_name: payload.last_name,
          birth_date: payload.birth_date,
          address: payload.address,
          spouse: payload.spouse,
          wedding_date: payload.wedding_date,
          children: payload.children,
          special_events: payload.special_events
        },
        {
          first_name: payload.first_name,
          last_name: payload.last_name,
          birth_date: payload.birth_date,
          address: payload.address,
          children: payload.children
        },
        {
          first_name: payload.first_name,
          last_name: payload.last_name,
          address: payload.address
        }
      ];

      let saveError: string | null = null;
      for (const attempt of attempts) {
        const { error: updateError } = await supabase
          .from(PROFILES_TABLE)
          .update(attempt)
          .eq("id", next.id);

        if (!updateError) {
          saveError = null;
          break;
        }
        saveError = updateError.message;
        if (!isPostgrestSchemaDriftError(updateError.message)) break;
      }

      setSaving(false);
      if (saveError) {
        setModalError(saveError);
        return false;
      }

      setForm(next);
      setEditKey(null);
      setSuccess("הפרטים עודכנו בהצלחה");
      return true;
    },
    []
  );

  const persistAvatar = useCallback(
    async (next: ParentProfileData) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setModalError("Supabase לא מוגדר.");
        return false;
      }

      setSaving(true);
      setModalError(null);

      const avatarUrl = next.avatar_url.trim() || null;
      if (!avatarUrl) {
        await removeOwnAvatar(supabase, next.id);
      }

      const { error: updateError } = await supabase
        .from(PROFILES_TABLE)
        .update({ avatar_url: avatarUrl })
        .eq("id", next.id);

      setSaving(false);
      if (updateError) {
        setModalError(updateError.message || "שמירת תמונת הפרופיל נכשלה.");
        return false;
      }

      setForm(next);
      setEditKey(null);
      setSuccess("תמונת הפרופיל עודכנה בהצלחה");
      return true;
    },
    []
  );

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !form) return;

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setModalError("Supabase לא מוגדר.");
        return;
      }

      setUploadingAvatar(true);
      setModalError(null);

      const result = await uploadOwnAvatar(supabase, form.id, file);
      if (!result.ok) {
        setModalError(result.error);
      } else {
        setDraftAvatarUrl(result.publicUrl);
      }
      setUploadingAvatar(false);
    },
    [form]
  );

  const handleAvatarRemove = useCallback(() => {
    setDraftAvatarUrl("");
    setModalError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form || !editKey) return;

    let next: ParentProfileData = { ...form };

    if (editKey === "first_name") next = { ...next, first_name: draftText.trim() };
    else if (editKey === "last_name") next = { ...next, last_name: draftText.trim() };
    else if (editKey === "birth_date") next = { ...next, birth_date: draftText };
    else if (editKey === "phone") {
      const phoneError = validateContactPhoneInput(draftText);
      if (phoneError) {
        setModalError(phoneError);
        return;
      }
      setSaving(true);
      setModalError(null);
      const saved = await requestSaveOwnContactPhone(draftText);
      setSaving(false);
      if (!saved.ok) {
        setModalError(saved.error);
        return;
      }
      setForm({ ...next, phone: saved.phone });
      setEditKey(null);
      setSuccess("הפרטים עודכנו בהצלחה");
      return;
    }
    else if (editKey === "address") {
      if (!draftAddress.city.trim() || !draftAddress.street.trim() || !draftAddress.houseNumber.trim()) {
        setModalError("יש למלא עיר, רחוב ומספר בית.");
        return;
      }
      next = { ...next, address: { ...draftAddress } };
    } else if (editKey === "spouse") {
      next = {
        ...next,
        spouse: draftHasSpouse ? { ...draftSpouse } : null,
        wedding_date: draftWeddingDate
      };
    } else if (editKey === "children") {
      next = { ...next, children: draftChildren.map((child) => ({ ...child })) };
    } else if (editKey === "special_events") {
      next = { ...next, special_events: draftEvents.map((event) => ({ ...event })) };
    } else if (editKey === "avatar") {
      next = { ...next, avatar_url: draftAvatarUrl.trim() };
    }

    if (editKey === "birth_date") {
      const dobError = getAccountDobEligibilityError("parent", next.birth_date);
      if (dobError) {
        setModalError(dobError);
        return;
      }
    }

    if (editKey === "avatar") {
      await persistAvatar(next);
      return;
    }

    await persist(next);
  }, [
    draftAddress,
    draftAvatarUrl,
    draftChildren,
    draftEvents,
    draftHasSpouse,
    draftSpouse,
    draftText,
    draftWeddingDate,
    editKey,
    form,
    persist,
    persistAvatar
  ]);

  if (loading || !form) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm">טוען את האזור האישי…</p>
      </div>
    );
  }

  const addressLabel = formatParentProfileAddress(form.address) || "";
  const spouseLabel = form.spouse
    ? `${form.spouse.firstName} ${form.spouse.lastName}`.trim() || "פרטי בן/בת זוג שמורים"
    : "לא הוגדר";
  const childrenLabel =
    form.children.length === 0
      ? "לא נוספו ילדים"
      : form.children
          .map((child) => {
            const date = formatDisplayDate(child.birthDate);
            return date ? `${child.name || "ללא שם"} (${date})` : child.name || "ללא שם";
          })
          .join(" · ");
  const eventsLabel =
    form.special_events.length === 0
      ? "לא נוספו אירועים"
      : form.special_events
          .map((event) => {
            const date = formatDisplayDate(event.date);
            return date ? `${event.title || "ללא כותרת"} (${date})` : event.title || "ללא כותרת";
          })
          .join(" · ");

  const modalTitle =
    editKey === "avatar"
      ? "עדכון תמונת פרופיל"
      : editKey === "first_name"
      ? "שינוי שם פרטי"
      : editKey === "last_name"
        ? "שינוי שם משפחה"
        : editKey === "birth_date"
          ? "שינוי תאריך לידה"
          : editKey === "phone"
            ? "מספר טלפון"
            : editKey === "address"
              ? "שינוי כתובת"
              : editKey === "spouse"
                ? "שינוי בן/בת זוג ויום נישואין"
                : editKey === "children"
                  ? "שינוי פרטי ילדים"
                  : editKey === "special_events"
                    ? "שינוי אירועים מיוחדים"
                    : "";

  const displayName = `${form.first_name} ${form.last_name}`.trim() || "הפרופיל שלי";

  return (
    <div className="space-y-4 pb-4" dir="rtl">
      <section className="rounded-2xl border border-[#C5A059]/25 bg-gradient-to-l from-[#FFF8EA] to-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-[#C5A059]/40 bg-slate-100 shadow-sm">
              {form.avatar_url ? (
                <img src={form.avatar_url} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <User className="h-8 w-8" />
                </div>
              )}
              <button
                type="button"
                onClick={() => openEdit("avatar")}
                className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition hover:opacity-100"
                title="שנה תמונה"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-[#B8860B]">אזור אישי · הורה</p>
              <h2 className="mt-1 text-lg font-extrabold text-[#001F3F]">{displayName}</h2>
              {publicId ? (
                <p className="mt-0.5 font-mono text-xs font-semibold text-slate-500" dir="ltr">
                  {publicId}
                </p>
              ) : null}
              <IdentityVerifiedBadgeLive userId={form.id} />
              <button
                type="button"
                onClick={() => openEdit("avatar")}
                className="mt-1.5 text-xs font-medium text-[#C5A059] underline hover:text-[#b08b4c]"
              >
                החלפת תמונת פרופיל
              </button>
            </div>
          </div>
          <Link
            href="/parent/wallet"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
          >
            <Wallet className="h-3.5 w-3.5" />
            ארנק
          </Link>
        </div>
      </section>

      <WelcomeReplayCard role="parent" />

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <IdentityPersonalSection role="parent" userId={form.id} />

      <PersonalAreaSection title="פרטים אישיים" description="הפרטים שנשמרו בשאלון ההרשמה">
        <PersonalStaticRow label="שם פרטי" value={form.first_name} onEdit={() => openEdit("first_name")} />
        <PersonalStaticRow label="שם משפחה" value={form.last_name} onEdit={() => openEdit("last_name")} />
        <PersonalStaticRow
          label="תאריך לידה"
          value={formatDisplayDate(form.birth_date)}
          onEdit={() => openEdit("birth_date")}
        />
        <PersonalStaticRow
          label="טלפון"
          value={formatContactPhoneDisplay(form.phone || authPhone)}
          onEdit={() => openEdit("phone")}
          dir="ltr"
          actionLabel={form.phone || authPhone ? "שינוי" : "הוספת מספר"}
        />
      </PersonalAreaSection>

      <PersonalAreaSection
        title="כתובת מגורים"
        accent="sky"
        description="הכתובת שמוצגת לשמרטפית במשמרות מאושרות"
        action={<PersonalChangeLink onClick={() => openEdit("address")} />}
      >
        <p className={`text-[16px] ${addressLabel ? "font-medium text-[#001F3F]" : "italic text-slate-400"}`}>
          {displayOrEmpty(addressLabel)}
        </p>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="בן/בת זוג ויום נישואין"
        accent="gold"
        action={<PersonalChangeLink onClick={() => openEdit("spouse")} />}
      >
        <div className="space-y-2 text-right">
          <p className={`text-[16px] ${form.spouse ? "font-medium text-[#001F3F]" : "italic text-slate-400"}`}>
            {spouseLabel}
          </p>
          {form.spouse?.birthDate ? (
            <p className="text-xs text-slate-500">תאריך לידה: {formatDisplayDate(form.spouse.birthDate)}</p>
          ) : null}
          <p className="text-xs text-slate-500">
            יום נישואין: {formatDisplayDate(form.wedding_date) || "לא הוגדר"}
          </p>
        </div>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="ילדים"
        accent="emerald"
        description="ימי הולדת של הילדים לפינוקים ותזכורות"
        action={<PersonalChangeLink onClick={() => openEdit("children")} />}
      >
        <p
          className={`text-[16px] leading-relaxed ${
            form.children.length ? "font-medium text-[#001F3F]" : "italic text-slate-400"
          }`}
        >
          {childrenLabel}
        </p>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="אירועים מיוחדים לפינוק"
        accent="gold"
        action={<PersonalChangeLink onClick={() => openEdit("special_events")} />}
      >
        <p
          className={`text-[16px] leading-relaxed ${
            form.special_events.length ? "font-medium text-[#001F3F]" : "italic text-slate-400"
          }`}
        >
          {eventsLabel}
        </p>
      </PersonalAreaSection>

      <PersonalEditModal
        open={editKey != null}
        title={modalTitle}
        onClose={closeEdit}
        onSave={handleSave}
        saving={saving || uploadingAvatar}
        error={modalError}
      >
        {editKey === "avatar" ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-2">
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 shadow-inner">
              {draftAvatarUrl ? (
                <img src={draftAvatarUrl} alt="תמונת פרופיל" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <User className="h-12 w-12" />
                </div>
              )}
              {uploadingAvatar ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <Loader2 className="h-6 w-6 animate-spin text-[#001F3F]" />
                </div>
              ) : null}
            </div>

            <label className="cursor-pointer rounded-xl bg-[#001F3F] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#001F3F]/90">
              {uploadingAvatar ? "מעלה תמונה..." : "בחר תמונה מהמכשיר"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
              />
            </label>
            {draftAvatarUrl || form.avatar_url ? (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={uploadingAvatar}
                className="text-xs font-medium text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
              >
                הסרת תמונת פרופיל
              </button>
            ) : null}
            <p className="text-center text-[13px] text-slate-500">
              פורמטים מותרים: JPG, PNG, WEBP (עד 5MB)
            </p>
          </div>
        ) : null}

        {editKey === "first_name" || editKey === "last_name" || editKey === "phone" ? (
          <PersonalField label={editKey === "phone" ? "מספר טלפון" : modalTitle.replace("שינוי ", "")}>
            <input
              className={personalInputClassName}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              dir={editKey === "phone" ? "ltr" : undefined}
              inputMode={editKey === "phone" ? "tel" : undefined}
              autoComplete={editKey === "phone" ? "tel" : undefined}
              placeholder={editKey === "phone" ? "0501234567" : undefined}
              autoFocus
            />
          </PersonalField>
        ) : null}

        {editKey === "birth_date" ? (
          <PersonalField label="תאריך לידה">
            <input
              type="date"
              className={personalInputClassName}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              autoFocus
            />
          </PersonalField>
        ) : null}

        {editKey === "address" ? (
          <div className="space-y-3">
            <PersonalField label="עיר">
              <IsraelCitiesMultiSelect
                value={(draftAddress.city ? [draftAddress.city] : []) as IsraelCity[]}
                onChange={(cities) =>
                  setDraftAddress((prev) => ({ ...prev, city: cities[cities.length - 1] || "" }))
                }
                label="בחרו עיר"
              />
            </PersonalField>
            <div className="grid grid-cols-3 gap-2">
              <PersonalField label="רחוב" className="col-span-2">
                <input
                  className={personalInputClassName}
                  value={draftAddress.street}
                  onChange={(e) => setDraftAddress((prev) => ({ ...prev, street: e.target.value }))}
                />
              </PersonalField>
              <PersonalField label="מס׳ בית">
                <input
                  className={personalInputClassName}
                  value={draftAddress.houseNumber}
                  onChange={(e) =>
                    setDraftAddress((prev) => ({ ...prev, houseNumber: e.target.value }))
                  }
                />
              </PersonalField>
            </div>
          </div>
        ) : null}

        {editKey === "spouse" ? (
          <div className="space-y-3">
            <PersonalCheckbox
              checked={draftHasSpouse}
              label="יש בן/בת זוג"
              onChange={setDraftHasSpouse}
            />
            {draftHasSpouse ? (
              <div className="space-y-3 rounded-xl border border-[#C5A059]/20 bg-[#FFFCF5] p-3">
                <PersonalField label="שם פרטי">
                  <input
                    className={personalInputClassName}
                    value={draftSpouse.firstName}
                    onChange={(e) => setDraftSpouse((prev) => ({ ...prev, firstName: e.target.value }))}
                  />
                </PersonalField>
                <PersonalField label="שם משפחה">
                  <input
                    className={personalInputClassName}
                    value={draftSpouse.lastName}
                    onChange={(e) => setDraftSpouse((prev) => ({ ...prev, lastName: e.target.value }))}
                  />
                </PersonalField>
                <PersonalField label="תאריך לידה">
                  <input
                    type="date"
                    className={personalInputClassName}
                    value={draftSpouse.birthDate}
                    onChange={(e) => setDraftSpouse((prev) => ({ ...prev, birthDate: e.target.value }))}
                  />
                </PersonalField>
              </div>
            ) : null}
            <PersonalField label="יום נישואין">
              <input
                type="date"
                className={personalInputClassName}
                value={draftWeddingDate}
                onChange={(e) => setDraftWeddingDate(e.target.value)}
              />
            </PersonalField>
          </div>
        ) : null}

        {editKey === "children" ? (
          <div className="space-y-2">
            {draftChildren.map((child, index) => (
              <div key={child.id} className="flex items-center gap-2">
                <input
                  className={personalInputClassName}
                  value={child.name}
                  placeholder={`שם ילד/ה ${index + 1}`}
                  onChange={(e) =>
                    setDraftChildren((prev) =>
                      prev.map((item) => (item.id === child.id ? { ...item, name: e.target.value } : item))
                    )
                  }
                />
                <input
                  type="date"
                  className={personalInputClassName}
                  value={child.birthDate}
                  onChange={(e) =>
                    setDraftChildren((prev) =>
                      prev.map((item) =>
                        item.id === child.id ? { ...item, birthDate: e.target.value } : item
                      )
                    )
                  }
                />
                <button
                  type="button"
                  className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                  onClick={() => setDraftChildren((prev) => prev.filter((item) => item.id !== child.id))}
                  aria-label="הסר ילד"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDraftChildren((prev) => [...prev, createEmptyChild()])}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#001F3F] px-3 py-2 text-xs font-bold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              הוסף ילד
            </button>
          </div>
        ) : null}

        {editKey === "special_events" ? (
          <div className="space-y-2">
            {draftEvents.map((event) => (
              <div key={event.id} className="space-y-2 rounded-xl border border-[#C5A059]/25 bg-[#FFFCF5] p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    className={personalInputClassName}
                    value={event.title}
                    placeholder="תיאור האירוע"
                    onChange={(e) =>
                      setDraftEvents((prev) =>
                        prev.map((item) =>
                          item.id === event.id ? { ...item, title: e.target.value } : item
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                    onClick={() =>
                      setDraftEvents((prev) => prev.filter((item) => item.id !== event.id))
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
                    setDraftEvents((prev) =>
                      prev.map((item) =>
                        item.id === event.id ? { ...item, date: e.target.value } : item
                      )
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDraftEvents((prev) => [...prev, createEmptySpecialEvent()])}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#B8860B] px-3 py-2 text-xs font-bold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              הוסף אירוע
            </button>
          </div>
        ) : null}
      </PersonalEditModal>
    </div>
  );
}
