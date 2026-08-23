"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import type { IsraelCity } from "@/lib/geo/israel-cities";
import { IdentityOnboardingCard } from "@/components/identity/identity-onboarding-card";
import { IdentityVerificationForm } from "@/components/identity/identity-verification-form";
import { getAccountDobEligibilityError } from "@/lib/auth/age-eligibility";
import { clearSecondRoleInProgress } from "@/lib/auth/product-profiles";
import {
  coalesceSignupNames,
  hasCompleteSignupNames,
  namesFromUserMetadata,
  readSignupNamesFromDevice,
  saveSignupNamesToDevice
} from "@/lib/auth/signup-names";
import {
  buildParentOnboardingSavePayload,
  PARENT_ONBOARDING_ADDRESS_ERROR,
  validateParentOnboardingRequiredFields
} from "@/lib/parent/parent-onboarding";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type SpecialEvent = {
  id: string;
  title: string;
  date: string;
};

type ChildBirth = {
  id: string;
  name: string;
  birthDate: string;
};

type Props = {
  onSaved?: () => void | Promise<void>;
};

export function ParentOnboardingWizard({ onSaved }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Names come from signup — never re-collected here.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [namesLoading, setNamesLoading] = useState(true);
  const [birthDate, setBirthDate] = useState("");

  // Address (Structured)
  const [selectedCity, setSelectedCity] = useState<IsraelCity[]>([]);
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");

  // Spouse Details (Optional)
  const [hasSpouse, setHasSpouse] = useState(false);
  const [spouseFirstName, setSpouseFirstName] = useState("");
  const [spouseLastName, setSpouseLastName] = useState("");
  const [spouseBirthDate, setSpouseBirthDate] = useState("");
  const [weddingDate, setWeddingDate] = useState("");

  // Children
  const [children, setChildren] = useState<ChildBirth[]>([]);

  // Special Pampering Events (Dynamic list with +)
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [verifyFormOpen, setVerifyFormOpen] = useState(false);

  const addChild = () => {
    setChildren([...children, { id: Math.random().toString(), name: "", birthDate: "" }]);
  };

  const updateChild = (id: string, field: "name" | "birthDate", value: string) => {
    setChildren(children.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeChild = (id: string) => {
    setChildren(children.filter(c => c.id !== id));
  };

  const addSpecialEvent = () => {
    setSpecialEvents([...specialEvents, { id: Math.random().toString(), title: "", date: "" }]);
  };

  const updateSpecialEvent = (id: string, field: "title" | "date", value: string) => {
    setSpecialEvents(specialEvents.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeSpecialEvent = (id: string) => {
    setSpecialEvents(specialEvents.filter(e => e.id !== id));
  };

  useEffect(() => {
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok || !auth.supabase || !auth.userId) {
        const cached = readSignupNamesFromDevice();
        if (cached) {
          setFirstName(cached.first_name);
          setLastName(cached.last_name);
        }
        setNamesLoading(false);
        return;
      }

      const {
        data: { user }
      } = await auth.supabase.auth.getUser();

      const { data: profileRow } = await auth.supabase
        .from(PROFILES_TABLE)
        .select("first_name, last_name")
        .eq("id", auth.userId)
        .maybeSingle();

      const resolved = coalesceSignupNames(
        profileRow,
        namesFromUserMetadata(user?.user_metadata as Record<string, unknown> | undefined),
        readSignupNamesFromDevice()
      );

      if (resolved.first_name) setFirstName(resolved.first_name);
      if (resolved.last_name) setLastName(resolved.last_name);
      if (hasCompleteSignupNames(resolved)) {
        saveSignupNamesToDevice(resolved);
      }
      setNamesLoading(false);
    })();
  }, []);

  const goToVerificationStep = () => {
    const requiredError = validateParentOnboardingRequiredFields({
      city: selectedCity[0],
      street,
      houseNumber,
      birthDate
    });
    if (requiredError) {
      setError(requiredError);
      if (requiredError !== PARENT_ONBOARDING_ADDRESS_ERROR) {
        setStep(1);
      }
      return;
    }
    setError(null);
    setStep(4);
  };

  const handleFinish = async () => {
    if (busy) return;
    const requiredError = validateParentOnboardingRequiredFields({
      city: selectedCity[0],
      street,
      houseNumber,
      birthDate
    });
    if (requiredError) {
      setError(requiredError);
      if (requiredError !== PARENT_ONBOARDING_ADDRESS_ERROR) {
        setStep(1);
      }
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const auth = await resolveBrowserAuth();
      if (!auth.ok || !auth.supabase || !auth.userId) {
        setError("יש להתחבר מחדש כדי לסיים את השאלון.");
        setBusy(false);
        return;
      }

      // שמירה אמיתית במסד הנתונים ועדכון חותמת הזמן לסיום השאלון
      const { error: dbError } = await auth.supabase
        .from(PROFILES_TABLE)
        .update(
          buildParentOnboardingSavePayload({
            firstName,
            lastName,
            birthDate,
            city: selectedCity[0] || "",
            street,
            houseNumber,
            hasSpouse,
            spouseFirstName,
            spouseLastName,
            spouseBirthDate,
            weddingDate,
            children,
            specialEvents
          })
        )
        .eq("id", auth.userId);

      if (dbError) {
        setError("שגיאה בשמירה: " + dbError.message);
        setBusy(false);
        return;
      }

      await onSaved?.();
      clearSecondRoleInProgress(auth.userId, "parent");
      router.replace("/parent/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm max-h-[85vh] overflow-y-auto rounded-[2rem] border-2 border-[#C5A059] bg-[#FDFBF6] p-6 text-center shadow-2xl my-auto" dir="rtl">
      <h2 className="mb-2 text-2xl font-bold text-[#001F3F]">ברוכים הבאים ל-AnyNanny</h2>
      <p className="mb-4 text-sm text-slate-600 leading-relaxed">
        בואו נכיר ונרשום את פרטי המשפחה כדי שנוכל להתאים לכם את הטוב ביותר ולפנק אתכם בזמן הנכון!
      </p>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {/* שלב 1: פרטים אישיים וכתובת מובנית */}
      {step === 1 && (
        <div className="space-y-4 text-right">
          <p className="font-bold text-sm text-[#001F3F] border-b pb-1">פרטי הורה מוביל</p>
          {namesLoading ? (
            <p className="text-center text-sm text-slate-500">טוען את פרטי ההרשמה…</p>
          ) : firstName.trim() && lastName.trim() ? (
            <div className="rounded-2xl border border-[#C5A059]/25 bg-white/80 px-4 py-3 text-right">
              <p className="text-[13px] font-semibold text-slate-500">שלום</p>
              <p className="mt-1 text-base font-bold text-[#001F3F]">
                {firstName} {lastName}
              </p>
              <p className="mt-1 text-[13px] text-slate-500">השם נשמר מההרשמה ואין צורך להקליד שוב</p>
            </div>
          ) : (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              לא נמצא שם מההרשמה. אפשר להמשיך — השם שכבר נשמר בהרשמה לא ישתנה.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">תאריך לידה *</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3.5 text-sm text-slate-700"
            />
          </div>

          {/* כתובת מובנית */}
          <div className="pt-2">
            <p className="font-bold text-sm text-[#001F3F] border-b pb-1 mb-2">כתובת מגורים</p>
            <div className="mb-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">עיר *</label>
              <IsraelCitiesMultiSelect
                value={selectedCity}
                onChange={(cities) => setSelectedCity(cities.slice(-1))} // בחירת עיר אחת מרכזית
                disabled={busy}
                label="בחר עיר"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">רחוב *</label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3 text-sm"
                  placeholder="שם רחוב"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">מס' בית *</label>
                <input
                  type="text"
                  value={houseNumber}
                  onChange={(e) => setHouseNumber(e.target.value)}
                  className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3 text-sm"
                  placeholder="מספר"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const dobError = getAccountDobEligibilityError("parent", birthDate);
              if (dobError) {
                setError(dobError);
                return;
              }
              setError(null);
              setStep(2);
            }}
            className="w-full rounded-2xl bg-[#001F3F] py-3.5 font-bold text-white transition hover:bg-blue-900 mt-4"
          >
            הבא
          </button>
        </div>
      )}

      {/* שלב 2: בן/בת זוג ויום נישואין (אופציונלי) */}
      {step === 2 && (
        <div className="space-y-4 text-right">
          <div className="flex items-center justify-between border-b pb-1">
            <p className="font-bold text-sm text-[#001F3F]">פרטי בן/בת זוג (אופציונלי)</p>
            <input
              type="checkbox"
              checked={hasSpouse}
              onChange={(e) => setHasSpouse(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          {hasSpouse && (
            <div className="space-y-3 bg-white/50 p-3 rounded-2xl border border-[#C5A059]/20">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">שם פרטי בן/בת הזוג</label>
                <input
                  type="text"
                  value={spouseFirstName}
                  onChange={(e) => setSpouseFirstName(e.target.value)}
                  className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3 text-sm"
                  placeholder="שם פרטי"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">שם משפחה בן/בת הזוג</label>
                <input
                  type="text"
                  value={spouseLastName}
                  onChange={(e) => setSpouseLastName(e.target.value)}
                  className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3 text-sm"
                  placeholder="שם משפחה"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">תאריך לידה בן/בת הזוג</label>
                <input
                  type="date"
                  value={spouseBirthDate}
                  onChange={(e) => setSpouseBirthDate(e.target.value)}
                  className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3 text-sm text-slate-700"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">יום נישואין (אופציונלי)</label>
            <input
              type="date"
              value={weddingDate}
              onChange={(e) => setWeddingDate(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3.5 text-sm text-slate-700"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 rounded-2xl border-2 border-[#001F3F]/20 py-3.5 font-bold text-[#001F3F] transition hover:bg-white/60"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-[1.4] rounded-2xl bg-[#001F3F] py-3.5 font-bold text-white transition hover:bg-blue-900"
            >
              הבא
            </button>
          </div>
        </div>
      )}

      {/* שלב 3: ילדים ואירועים מיוחדים לפינוק */}
      {step === 3 && (
        <div className="space-y-4 text-right">
          <div className="border-b pb-1 flex items-center justify-between">
            <p className="font-bold text-sm text-[#001F3F]">תאריכי ימי הולדת של הילדים</p>
            <button
              type="button"
              onClick={addChild}
              className="rounded-xl bg-[#001F3F] px-3 py-1 text-xs font-bold text-white transition hover:bg-blue-900"
            >
              + הוסף ילד
            </button>
          </div>

          {children.length === 0 ? (
            <p className="text-xs text-slate-500 italic">לא נוספו ילדים עדיין. לחצו על "+ הוסף ילד".</p>
          ) : (
            <div className="space-y-3 max-h-[25vh] overflow-y-auto pr-1">
              {children.map((child, index) => (
                <div key={child.id} className="flex gap-2 items-center bg-white p-2.5 rounded-2xl border border-[#C5A059]/30">
                  <input
                    type="text"
                    value={child.name}
                    onChange={(e) => updateChild(child.id, "name", e.target.value)}
                    className="w-1/2 rounded-xl border border-slate-200 p-2 text-xs"
                    placeholder={`שם ילד/ה ${index + 1}`}
                  />
                  <input
                    type="date"
                    value={child.birthDate}
                    onChange={(e) => updateChild(child.id, "birthDate", e.target.value)}
                    className="w-1/2 rounded-xl border border-slate-200 p-2 text-xs text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => removeChild(child.id)}
                    className="text-rose-500 hover:text-rose-700 font-bold px-1 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* אירועים מיוחדים נוספים לפינוק */}
          <div className="border-b pb-1 pt-2 flex items-center justify-between">
            <div>
              <p className="font-bold text-sm text-[#001F3F]">אירועים מיוחדים לפינוק</p>
              <p className="text-[13px] text-slate-500">אירועים שתרצו שנזכיר כדי לפנק אתכם</p>
            </div>
            <button
              type="button"
              onClick={addSpecialEvent}
              className="rounded-xl bg-[#B8860B] px-3 py-1 text-xs font-bold text-white transition hover:bg-yellow-700"
            >
              + הוסף אירוע
            </button>
          </div>

          {specialEvents.length === 0 ? (
            <p className="text-xs text-slate-500 italic">לדוגמה: יום הולדת לחבר טוב, ציון דרך וכו'.</p>
          ) : (
            <div className="space-y-3 max-h-[25vh] overflow-y-auto pr-1">
              {specialEvents.map((event) => (
                <div key={event.id} className="flex flex-col gap-1.5 bg-white p-3 rounded-2xl border border-[#C5A059]/30">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={event.title}
                      onChange={(e) => updateSpecialEvent(event.id, "title", e.target.value)}
                      className="w-full rounded-xl border border-slate-200 p-2 text-xs"
                      placeholder="תיאור האירוע (למשל: יום נישואין הורים / יום הולדת לכלב...)"
                    />
                    <button
                      type="button"
                      onClick={() => removeSpecialEvent(event.id)}
                      className="text-rose-500 hover:text-rose-700 font-bold px-1 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    type="date"
                    value={event.date}
                    onChange={(e) => updateSpecialEvent(event.id, "date", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep(2)}
              className="flex-1 rounded-2xl border-2 border-[#001F3F]/20 py-3.5 font-bold text-[#001F3F] transition hover:bg-white/60 disabled:opacity-60"
            >
              חזרה
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={goToVerificationStep}
              className="flex-[1.4] rounded-2xl bg-[#001F3F] py-3.5 font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
            >
              הבא
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <IdentityOnboardingCard
            busy={busy}
            onVerifyNow={() => setVerifyFormOpen(true)}
            onSkipLater={() => void handleFinish()}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => setStep(3)}
            className="w-full rounded-2xl border-2 border-[#001F3F]/20 py-3 font-bold text-[#001F3F] transition hover:bg-white/60 disabled:opacity-60"
          >
            חזרה
          </button>
        </div>
      )}

      <IdentityVerificationForm
        open={verifyFormOpen}
        role="parent"
        nextPath="/parent/profile"
        onClose={() => setVerifyFormOpen(false)}
        onSaved={async () => {
          setVerifyFormOpen(false);
          await handleFinish();
        }}
      />
    </div>
  );
}