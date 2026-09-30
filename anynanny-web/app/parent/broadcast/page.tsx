"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ShieldCheck } from "lucide-react";
import { BroadcastPanelControls } from "@/components/parent/broadcast-panel-controls";
import { AnyNannyNowHero } from "@/components/parent/anynanny-now-hero";
import { NowRecipientFilters } from "@/components/parent/now-recipient-filters";
import { CtaEnergyOrb } from "@/components/parent/cta-energy-orb";
import { NowSoonTimeRecommendation } from "@/components/parent/now-soon-time-recommendation";
import { NowSpecificTimeInput } from "@/components/parent/now-specific-time-input";
import {
  broadcastRadarHref,
  fetchActiveBroadcastForParent
} from "@/lib/broadcast/parent-active-broadcast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { setBroadcastMinimized } from "@/lib/broadcast/broadcast-minimize-preference";
import { fetchIsAccountSuspended } from "@/lib/safety/enforcement";
import { ACCOUNT_SUSPENDED_MESSAGE } from "@/lib/safety/constants";
import {
  applyNowSoonRecommendation,
  buildNowBroadcastAlertInsert,
  classifyNowSpecificTime,
  legacyNowBroadcastAlertInsert,
  omitNowBroadcastTrustFilterColumns,
  NOW_PAST_TIME_MESSAGE,
  NOW_TIMING_ASAP,
  NOW_TIMING_SPECIFIC,
  resolveNowSubmitGate,
  type NowTimingMode
} from "@/lib/broadcast/now-request-details";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";

const ALL_ISRAELI_CITIES = [
  "אבו גוש", "אבו סנאן", "אבן יהודה", "אבשלום", "אדמית", "אודם", "אוהד", "אומר", "אופקים", "אור הגר", "אור יהודה", "אור עקיבא", "אורה", "אורות", "אחיהוד", "אחיטוב", "אחיסמך", "איבים", "אייל", "איילת השחר", "אילון", "אילות", "אילת", "אירוס", "איתמר", "אכסאל", "אלון הגליל", "אלון מורה", "אלון שבות", "אלומה", "אלומות", "אלחנן", "אלטייבה", "אליאב", "אליכין", "אליפז", "אליפלט", "אליקים", "אלעד", "אלפי מנשה", "אלקנה", "אמירים", "אמנון", "אספר", "אעבלין", "אפיקים", "אפרת", "ארבל", "ארגמן", "ארז", "אריאל", "אשרת", "אשתאול", "באר מילכה", "באר שבע", "באר טוביה", "באקה אל-גרביה", "בגדות", "בצרה", "בצרון", "בקעות", "ברוכין", "ברור היל", "ברק", "ברקן", "ברעם", "בת הדר", "בת חן", "בת חפר", "בת ים", "בת שלמה", "ג'דיידה-מכר", "ג'ולס", "ג'לג'וליה", "ג'סר א-זרקא", "ג'ש (גוש חלב)", "ג'ת", "גאולי תימון", "גאולים", "גבולות", "גבים", "גברעם", "גבע בנימין", "גבע כרמל", "גבעת אלה", "גבעת ברנר", "גבעת השלושה", "גבעת זאב", "גבעת חן", "גבעת חיים (איחוד)", "גבעת חיים (מאוחד)", "גבעת יואב", "גבעת ישעיהו", "גבעת כ\"ח", "גבעת ניל\"י", "גבעת עוז", "גבעת שמואל", "גבעתיים", "גדות", "גדיש", "גדרה", "גונן", "גורן", "גורנות הגליל", "גזית", "גיאה", "גינוסר", "גיבתון", "גילת", "גינתון", "גלאון", "גלגל", "גלעד (אבן יצחק)", "גני הדר", "גני תקווה", "געש", "געתון", "גפן", "גשר", "גשר הזיו", "גת", "גת רימון", "דאלית אל-כרמל", "דבורה", "דבוריה", "דבירה", "דברת", "דגניה א'", "דגניה ב'", "דור", "דורות", "דחי", "דימונה", "דישון", "דלתון", "דריג'את", "האון", "הבונים", "הגושרים", "הדור", "הודיה", "הוד השרון", "הזורע", "המעפיל", "הסוללים", "העוגן", "הר אדר", "הר גילה", "הראל", "הרצליה", "הררית", "ורד יריחו", "זבדיאל", "זמר", "זמרת", "זכרון יעקב", "זכריה", "זיתן", "זרזיר", "חבצלת השרון", "חגור", "חדיד", "חצור הגלילית", "חולדה", "חולון", "חולית", "חוסן", "חופית", "חוקוק", "חיטים", "חיפה", "חמד", "חמדיה", "חמדת", "חצבה", "חרשים", "חרות", "חריש", "חשמונאים", "טבריה", "טורעאן", "טייבה", "טירה", "טירת כרמל", "טירת יהודה", "טל שחר", "טללים", "טמרה", "טפחות", "יבול", "יבנה", "יבנאל", "יד בנימין", "יד השמונה", "יד מרדכי", "יד נתן", "יד רמב\"ם", "יהוד-מונוסון", "יובל", "יובלים", "יודפת", "יונתן", "יושיביה", "ינוב", "יסוד המעלה", "יסודות", "יעבץ", "יעד", "יעף", "יערה", "יפית", "יפעת", "יפתח", "יצהר", "יקום", "יקנעם עילית", "ירושלים", "ירחיב", "ירקונה", "ישע", "ישעי", "יתד", "כאבול", "כאוכב אבו אל-היג'א", "כפר אביב", "כפר אדומים", "כפר אוריה", "כפר ביאליק", "כפר ביל\"و", "כפר בלום", "כפר גדעון", "כפר גלים", "כפר גלעדי", "כפר דניאל", "כפר האורנים", "כפר החורש", "כפר הרא\"ה", "כפר הרי\"ף", "כפר השופט", "כפר ויתקין", "כפר ורדים", "כפר זיתים", "כפר חסידים א'", "כפר חסידים ب'", "כפר חזקיה", "כפר חיטים", "כפר חיים", "כפר חנניה", "כפר טרומן", "כפר יונה", "כפר יחזקאל", "כפר יעבץ", "כפר כמא", "כפר מנדא", "כפר מונש", "כפר מימון", "כפר מל\"ל", "כפר מנחם", "כפר מסריק", "כפר מרדכי", "כפר נטר", "כפר סבא", "כפר סירקין", "כפר עציון", "כפר פינס", "כפר קאסם", "כפר קיש", "כפר ראש הנקרא", "כפר רופין", "כפר רות", "כפר שמאי", "כפר שמואל", "כפר שמריהו", "כפר תבור", "כפר אחים", "כפר תקווה", "כרמי צור", "כרמיאל", "כרמיה", "כרמים", "כרמי יוסף", "להב", "להבים", "להבות הבשן", "להבות חביבה", "לוד", "לוזית", "לוחמי הגטאות", "לטרון", "לימן", "לכיש", "מבוא חורון", "מבוא מודיעים", "מבוא דותן", "מבוא חמה", "מבואות ביתר", "מבואות הירדן", "מבשרת ציון", "מגדל", "מגדל העמק", "מגדלים", "מגאר", "מגשימים", "מדרך עוז", "מדרשת בן-גוריון", "מודיעין-מכבים-רעות", "מודיעין עילית", "מולדת", "מוצא עלית", "מורשת", "מזרע", "מזרעה", "מחולה", "מחניים", "מחסיה", "מטולה", "מי עמי", "מיצר", "מירב", "מירון", "מישר", "מיתר", "מכמורת", "מכורה", "מלכיה", "מלכישוע", "מנוחה", "מנוף", "מסד", "מסדה", "מסלול", "מסעדה", "מעברות", "מעגלים", "מעגן", "מעגן מיכאל", "מעוז ציון", "מעוז חיים", "מעלות-תרשיחא", "מעלה אדומים", "מעלה גלבוע", "מעלה גמלא", "מעלה החמישה", "מעלה לבונה", "מעלה מכמש", "מעלה עירון", "מעלה צביה", "מעלה שומרון", "מפלסים", "מצדות יהודה", "מצפה אביב", "מצפה הילה", "מצפה רמון", "מרגליות", "משהד", "משמר איילון", "משמר דוד", "משמר הירדן", "משמר הנגב", "משמר העמק", "משמר השבעה", "משמר השרון", "משמרת", "משען", "מתן", "מתת", "מתתיהו", "נאות גולן", "נאות הכיכר", "נאות מרדכי", "נגבה", "נהורה", "נהלל", "נהריה", "נוב", "נוגה", "נוה אטי\"ב", "נוה איתן", "נוה דניאל", "נוה זוהר", "נוה חריף", "נוה מיכאל", "נוה שלום", "נוף הגליל", "נוף איילון", "נופים", "נופית", "נוקדים", "נורדיה", "נורית", "נחלה", "נחליאל", "נחלים", "נחף", "נחשון", "נחשונים", "נטועה", "נטור", "נטע", "נטעים", "ניל\"י", "ניצן", "ניצני סיני", "ניצני עוז", "ניצנים", "ניר אליהו", "ניר בנים", "ניר גלים", "ניר דוד (תל עמל)", "ניר חן", "ניר יפה", "ניר יצחק", "ניר ישראל", "ניר משה", "ניר עוז", "ניר עם", "ניר צבי", "נירים", "נירית", "נמל תעופה בן-גוריון", "נשר", "נתיב הגדוד", "נתיב הל\"ה", "נתיב השיירה", "נתיבות", "נתניה", "סאסא", "סביון", "סגולה", "סולם", "סח'נין", "סלמה", "ספיר", "עברון", "עגור", "עודים", "עומר", "עופר", "עוצם", "עטרת", "עין איילה", "עין גדי", "עין גב", "עין הוד", "עין החורש", "עין המפרץ", "עין הנצי\"ב", "עין השופט", "עין השלושה", "עין ורד", "עין זיתים", "עין חוד", "עין חרוד (איחוד)", "עין חרוד (מאוחד)", "עין כרמל", "עין כמונים", "עין נקובא", "עין רפא", "עין תמר", "עינב", "עירון", "עכו", "עלמה", "עלומים", "עמוקה", "עמינדב", "עמיקם", "עמיר", "עמנואל", "ענב", "עספיא", "עפולה", "עץ אפרים", "עצמונה", "ערד", "ערב אל-נעאים", "ערב העראמשה", "ערערה", "ערערה בנגב", "עתלית", "פארן", "פדואל", "פדויים", "פוריה - כפר עבודה", "פוריה נווה עובד", "פוריה עילית", "פורדיס", "פטיש", "פתח תקווה", "פתחיה", "צובה", "צוחר", "צביה", "ציפורי", "צלפון", "צפת", "צפית", "צרופה", "צרעה", "קבוצת יבנה", "קדומים", "קדימה-צורן", "קדושים", "קדמה", "קדש ברנע", "קציר", "קצרין", "קריית אונו", "קריית ארבע", "קריית אתא", "קריית ביאליק", "קריית גת", "קריית טבעון", "קריית ים", "קריית יערים", "קריית מוצקין", "קריית מלאכי", "קריית עקרון", "קריית שמונה", "קרני שומרון", "שבי ציון", "שבי דרום", "שגב-שלום", "שדה אליעזר", "שדה בוקר", "שדה דוד", "שדה ורבורג", "שדה יואב", "שדה יעקב", "שדה משה", "שדה נחום", "שדה נחמיה", "שדות מיכה", "שדי חמד", "שדי אברהם", "שדי תרומות", "שדמה", "שדרות", "שובל", "שומרה", "שומרון", "שזור", "שחר", "שחרות", "שיזפון", "שיבלי - אום אל-ג'נם", "שילה", "שמיר", "שמעה", "שני (ליבנה)", "שעב", "שפיר", "שפר", "שפרעם", "שקף", "שרונה", "תאשור", "תדהר", "תושיה", "תל אביב-יפו", "תל תאומים", "תל עדשים", "תל קציר", "תל מונד", "תלמים", "תעוז", "תפרח", "תקומה", "תקוע"
];

export default function ParentBroadcastSetupPage() {
  const router = useRouter();
  const [city, setCity] = useState("חיפה");
  const [isOpen, setIsOpen] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [timingMode, setTimingMode] = useState<NowTimingMode | null>(null);
  const [requestedTime, setRequestedTime] = useState("");
  const [soonTime, setSoonTime] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [verifiedSittersOnly, setVerifiedSittersOnly] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pastTimeMessage =
    timingMode === NOW_TIMING_SPECIFIC &&
    classifyNowSpecificTime(requestedTime, new Date()).kind === "past"
      ? NOW_PAST_TIME_MESSAGE
      : null;

  const filteredCities = ALL_ISRAELI_CITIES.filter((c) =>
    c.includes(city.trim())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const goDashboard = () => {
    router.replace("/parent/dashboard");
  };

  const handleStartBroadcast = async (decision?: {
    timingMode: NowTimingMode;
    requestedTime: string | null;
    acknowledgedSoon?: boolean;
  }) => {
    const gate = resolveNowSubmitGate({
      timingMode: decision?.timingMode ?? timingMode,
      requestedTime: decision ? decision.requestedTime : requestedTime,
      now: new Date(),
      acknowledgedSoon: decision?.acknowledgedSoon
    });
    if (gate.action === "invalid") {
      window.alert(gate.message);
      return;
    }
    if (gate.action === "block_past") {
      return;
    }
    if (gate.action === "recommend_asap") {
      setSoonTime(gate.requestedTime);
      return;
    }

    setIsBroadcasting(true);
    setSoonTime(null);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        router.push(`/parent/search/broadcast-radar?city=${encodeURIComponent(city)}&alertId=simulation-id`);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/parent/search/broadcast-radar?city=${encodeURIComponent(city)}&alertId=simulation-id`);
        return;
      }

      if (await fetchIsAccountSuspended(supabase, user.id)) {
        window.alert(ACCOUNT_SUSPENDED_MESSAGE);
        setIsBroadcasting(false);
        return;
      }

      const { broadcast: existing } = await fetchActiveBroadcastForParent(supabase, user.id);
      if (existing) {
        setBroadcastMinimized(false);
        router.replace(broadcastRadarHref(existing));
        return;
      }

      const timing = {
        timingMode: gate.timingMode,
        requestedTime: gate.requestedTime
      };

      // שימוש בטבלה האמיתית הקיימת broadcast_alerts
      let address: unknown = null;
      const profileRead = await supabase
        .from("profiles")
        .select("address")
        .eq("id", user.id)
        .maybeSingle();
      if (!profileRead.error && profileRead.data && typeof profileRead.data === "object") {
        address = (profileRead.data as { address?: unknown }).address ?? null;
      }

      let insertRow = buildNowBroadcastAlertInsert({
        parentId: user.id,
        city: city,
        address,
        timingMode: timing.timingMode,
        requestedTime: timing.requestedTime,
        favoritesOnly,
        verifiedSittersOnly
      });

      let { data, error } = await supabase
        .from("broadcast_alerts")
        .insert([insertRow])
        .select()
        .single();

      if (
        error &&
        (isPostgrestMissingColumnError(error.message, "favorites_only") ||
          isPostgrestMissingColumnError(error.message, "verified_sitters_only"))
      ) {
        if (favoritesOnly || verifiedSittersOnly) {
          window.alert("לא ניתן להחיל את הסינון כרגע. נסו שוב בלי הסינון.");
          setIsBroadcasting(false);
          return;
        }
        insertRow = omitNowBroadcastTrustFilterColumns(insertRow);
        const retry = await supabase.from("broadcast_alerts").insert([insertRow]).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error && isPostgrestSchemaDriftError(error.message)) {
        if (favoritesOnly || verifiedSittersOnly) {
          window.alert("לא ניתן להחיל את הסינון כרגע. נסו שוב בלי הסינון.");
          setIsBroadcasting(false);
          return;
        }
        const fallback = await supabase
          .from("broadcast_alerts")
          .insert([
            legacyNowBroadcastAlertInsert({
              parentId: user.id,
              city: city
            })
          ])
          .select()
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      if (error || !data) {
        console.error("Supabase insert error:", error);
        router.push(`/parent/search/broadcast-radar?city=${encodeURIComponent(city)}&alertId=simulation-id`);
        return;
      }

      setBroadcastMinimized(false);
      router.push(`/parent/search/broadcast-radar?city=${encodeURIComponent(city)}&alertId=${data.id}`);
    } catch (err) {
      console.error("Broadcast start error:", err);
      router.push(`/parent/search/broadcast-radar?city=${encodeURIComponent(city)}&alertId=simulation-id`);
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <div dir="rtl" className="-mx-4 min-w-0 overflow-x-hidden bg-[#FDFBF6] pb-10">
      <div className="mx-auto w-[min(98vw,500px)]">
      <div className="rounded-3xl border border-slate-200/60 bg-white px-4 pb-8 pt-5 shadow-soft">
        <BroadcastPanelControls onBack={goDashboard} />

        <div className="mt-2 px-1 text-center" data-tour="anynanny-now-explain">
          <h1
            className="text-center text-[22px] font-medium not-italic leading-snug text-[#001F3F] min-[390px]:text-[23px]"
            style={{
              fontStyle: "normal",
              transform: "none",
              fontWeight: 500,
              letterSpacing: "normal"
            }}
          >
            <span className="font-medium text-[#001F3F]">למצוא בייביסיטר </span>
            <span className="whitespace-nowrap font-medium text-[#00A86B]">מעכשיו לעכשיו?</span>
          </h1>
          <p
            className="mt-1 text-center text-[22px] font-medium not-italic leading-snug text-[#001F3F] min-[390px]:text-[23px]"
            style={{ fontStyle: "normal", transform: "none", fontWeight: 500 }}
          >
            זה קל!
          </p>
        </div>

        <AnyNannyNowHero />

        <p
          className="mt-3 text-center text-[16px] font-normal leading-[1.5] text-[#001F3F]/70 not-italic min-[430px]:text-[17px]"
          style={{ fontStyle: "normal", transform: "none" }}
        >
          בחרו עיר, ואנחנו נפנה מיד לבייביסיטריות הזמינות באזור.
        </p>

        <div className="space-y-6 pt-7 text-right">
          <div className="relative space-y-2" ref={wrapperRef}>
            <label
              className="block whitespace-nowrap text-[16px] font-medium not-italic text-[#001F3F] min-[430px]:text-[17px]"
              style={{ fontStyle: "normal", transform: "none" }}
            >
              עיר / אזור חיפוש:
            </label>
            <div className="relative flex items-center">
              <MapPin className="pointer-events-none absolute right-4 h-5 w-5 text-[#001F3F]" />
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                placeholder="הקלד או בחר עיר בישראל..."
                className="h-[52px] w-full rounded-[15px] border border-slate-200/80 bg-white py-3 pl-4 pr-12 text-[17px] font-medium not-italic text-[#001F3F] shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                style={{ fontStyle: "normal", transform: "none" }}
              />
            </div>

            {isOpen && filteredCities.length > 0 && (
              <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
                {filteredCities.map((c) => (
                  <li
                    key={c}
                    onClick={() => {
                      setCity(c);
                      setIsOpen(false);
                    }}
                    className="cursor-pointer px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <p
              className="block text-[16px] font-medium not-italic text-[#001F3F] min-[430px]:text-[17px]"
              style={{ fontStyle: "normal", transform: "none" }}
            >
              מתי צריך בייביסיטר?
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                aria-pressed={timingMode === NOW_TIMING_ASAP}
                disabled={isBroadcasting}
                onClick={() => {
                  setSoonTime(null);
                  setTimingMode(NOW_TIMING_ASAP);
                }}
                className={`min-h-12 rounded-[15px] border px-3 py-3 text-right text-[15px] font-semibold leading-snug transition ${
                  timingMode === NOW_TIMING_ASAP
                    ? "border-[#00A86B] bg-emerald-50 text-[#001F3F]"
                    : "border-slate-200 bg-white text-[#001F3F]"
                }`}
              >
                בהקדם האפשרי
              </button>
              <button
                type="button"
                aria-pressed={timingMode === NOW_TIMING_SPECIFIC}
                disabled={isBroadcasting}
                onClick={() => setTimingMode(NOW_TIMING_SPECIFIC)}
                className={`min-h-12 rounded-[15px] border px-3 py-3 text-right text-[15px] font-semibold leading-snug transition ${
                  timingMode === NOW_TIMING_SPECIFIC
                    ? "border-[#00A86B] bg-emerald-50 text-[#001F3F]"
                    : "border-slate-200 bg-white text-[#001F3F]"
                }`}
              >
                שעה מסוימת
              </button>
            </div>
            {timingMode === NOW_TIMING_SPECIFIC ? (
              <label className="block space-y-1">
                <span className="text-sm font-medium text-[#001F3F]">שעה</span>
                <NowSpecificTimeInput
                  value={requestedTime}
                  disabled={isBroadcasting}
                  onChange={(value) => {
                    setSoonTime(null);
                    setRequestedTime(value);
                  }}
                />
                {pastTimeMessage ? (
                  <p role="alert" className="text-sm font-medium text-red-600">
                    {pastTimeMessage}
                  </p>
                ) : null}
              </label>
            ) : null}
          </div>

          <NowRecipientFilters
            favoritesOnly={favoritesOnly}
            verifiedSittersOnly={verifiedSittersOnly}
            disabled={isBroadcasting}
            onFavoritesOnlyChange={setFavoritesOnly}
            onVerifiedSittersOnlyChange={setVerifiedSittersOnly}
          />

          <div className="relative mx-auto w-[90%] overflow-visible pt-2">
            <button
              type="button"
              disabled={isBroadcasting}
              onClick={() => void handleStartBroadcast()}
              className="flex min-h-[56px] w-full items-center justify-center whitespace-nowrap rounded-[28px] py-2 pl-12 pr-3 text-center font-semibold leading-none text-white not-italic shadow-[0_10px_22px_-6px_rgba(0,168,107,0.55)] transition hover:brightness-105 disabled:opacity-60 min-[390px]:pl-[3.25rem]"
              style={{
                fontStyle: "normal",
                transform: "none",
                whiteSpace: "nowrap",
                fontSize: "clamp(15px, 4.6vw, 18px)",
                background:
                  "linear-gradient(180deg, #19c56f 0%, #00A86B 48%, #088A58 100%)"
              }}
            >
              {isBroadcasting ? "משדר לכל האזור..." : "חיפוש בייביסיטר מעכשיו לעכשיו"}
            </button>
            <CtaEnergyOrb />
          </div>

          <p className="flex items-start justify-center gap-2 text-right text-sm font-medium leading-relaxed text-[#001F3F]/75">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#00A86B]" aria-hidden />
            <span>
              הבקשה נשלחת לבייביסיטריות הרלוונטיות באזור – הראשונה שמאשרת יכולה להתאים למשמרת.
            </span>
          </p>
        </div>
      </div>
      </div>
      {soonTime ? (
        <NowSoonTimeRecommendation
          requestedTime={soonTime}
          disabled={isBroadcasting}
          onDismiss={() => {
            if (!isBroadcasting) setSoonTime(null);
          }}
          onSwitchToAsap={() => {
            const next = applyNowSoonRecommendation("switch_to_asap", soonTime);
            setTimingMode(next.timingMode);
            setRequestedTime("");
            void handleStartBroadcast({
              timingMode: next.timingMode,
              requestedTime: next.requestedTime,
              acknowledgedSoon: true
            });
          }}
          onKeepSpecific={() => {
            const next = applyNowSoonRecommendation("keep_specific", soonTime);
            setTimingMode(next.timingMode);
            setRequestedTime(next.requestedTime ?? "");
            void handleStartBroadcast({
              timingMode: next.timingMode,
              requestedTime: next.requestedTime,
              acknowledgedSoon: true
            });
          }}
        />
      ) : null}
    </div>
  );
}