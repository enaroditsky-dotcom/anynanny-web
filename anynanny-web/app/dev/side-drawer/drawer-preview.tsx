"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOGOUT_BUTTON_CLASS, LogoutButtonContent } from "@/components/account/logout-button";
import { AppSideDrawerFrame } from "@/components/navigation/app-side-drawer-frame";
import { useAppSideDrawer } from "@/components/navigation/use-app-side-drawer";
import { APP_SIDE_DRAWER_ID } from "@/lib/navigation/app-side-drawer";
import { PreviewBottomNav } from "./preview-bottom-nav";
import { PreviewHome } from "./preview-home";

const PREVIEW_PATH = "/dev/side-drawer";
const PREVIEW_NEXT_PATH = "/dev/side-drawer/next";

const PARAGRAPHS = [
  "זהו מסך פיתוח לבדיקת המגירה. אין כאן חשבון, הזמנות או מידע אישי.",
  "התפריט נמצא בקצה הימני של הכותרת, והלוגו במרכז הוא כפתור הבית. אין כאן התחברות מדומה.",
  "התוכן ארוך בכוונה כדי לבדוק גלילה בתוך אזור הגלילה של המעטפת.",
  "כשהמגירה סגורה, הגלילה נשארת באזור הזה והלוח הראשי נשאר במקומו.",
  "פתיחה מהכפתור שבכותרת מציגה את המגירה מעל העמוד, מהקצה הימני, בלי להזיז את הלוח.",
  "אפשר לסגור עם כפתור התפריט בכותרת, עם מקש Escape, או בלחיצה על הרקע הכהה.",
  "החלפת הנתיב המדומה סוגרת את המגירה בלי לעבור למסך הורה או בייביסיטר.",
  "חלון הבדיקה החוסם אמור לסגור את המגירה כל עוד הוא פתוח.",
  "העדפת הפחתת תנועה של המערכת מדלגת על האנימציה.",
  "אין במסך הזה קישורים ללוחות הבקרה ואין נתוני משתמש.",
  "המשיכו לגלול כדי לוודא שהאזור הגליל ארוך מגובה החלון.",
  "השורה הזו מוסיפה גובה קבוע לבדיקת גלילה במסכים נמוכים.",
  "השורה הזו ממשיכה את אותו תוכן סטטי, בלי פרסומות ובלי פרטים אישיים.",
  "עוד פסקה סטטית כדי שהגלילה תישאר אפשרית אחרי שינוי גודל החלון.",
  "המגירה מציגה את יעדי התפריט. פריטים שעדיין לא זמינים מסומנים כבקרוב ואינם לחיצים.",
  "אחרי סגירה, הלוח נשאר במקום בלי טרנספורמציה על אזור הגלילה.",
  "זהו סוף התוכן הסטטי של תצוגת הפיתוח."
];

type PreviewRole = "parent" | "sitter";
type PreviewTour = "off" | "drawer" | "messages";

/** Visual sample only. It is not wired to sign-out or navigation. */
function PreviewDrawerLogout() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(`#${APP_SIDE_DRAWER_ID} [data-app-drawer-footer]`));
  }, []);

  if (!host) return null;

  return createPortal(
    <div data-dev-drawer-logout="" className="relative z-[1] shrink-0 border-t border-[#001F3F]/10 bg-[#FFFEFC] px-3 py-3">
      <button
        type="button"
        aria-disabled="true"
        className={LOGOUT_BUTTON_CLASS}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <LogoutButtonContent />
      </button>
    </div>,
    host
  );
}

export function DrawerPreview() {
  const [simulatedPath, setSimulatedPath] = useState(PREVIEW_PATH);
  const [blocking, setBlocking] = useState(false);
  const [menuRole, setMenuRole] = useState<PreviewRole>("parent");
  const [menuPath, setMenuPath] = useState(PREVIEW_PATH);
  const [tourSim, setTourSim] = useState<PreviewTour>("off");
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawer = useAppSideDrawer(true, simulatedPath);

  useEffect(() => {
    const root = document.documentElement;
    if (tourSim === "drawer") {
      root.setAttribute("data-product-tour-step", menuRole === "sitter" ? "sitter-personal-area" : "personal-area");
    } else if (tourSim === "messages") {
      root.setAttribute("data-product-tour-step", menuRole === "sitter" ? "sitter-messages" : "messages");
    } else {
      root.removeAttribute("data-product-tour-step");
    }
    return () => root.removeAttribute("data-product-tour-step");
  }, [menuRole, tourSim]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtml = html.style.overflow;
    const previousBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtml;
      body.style.overflow = previousBody;
    };
  }, []);

  return (
    <div
      data-dev-side-drawer-preview=""
      data-preview-phase={drawer.phase}
      data-preview-path={simulatedPath}
      data-preview-menu-role={menuRole}
    >
      <AppSideDrawerFrame
        clipRef={drawer.clipRef}
        scrollRef={scrollRef}
        phase={drawer.phase}
        enabled={drawer.enabled}
        clipRaised={drawer.clipRaised}
        panelStyle={drawer.panelStyle}
        backdropStyle={drawer.backdropStyle}
        onPanelTransitionEnd={drawer.onPanelTransitionEnd}
        onOpenMenu={drawer.toggleDrawer}
        onClose={drawer.closeDrawer}
        menuButtonRef={drawer.menuButtonRef}
        navigationRole={menuRole}
        navigationPath={menuPath}
        onHomePress={() => {
          setMenuPath(PREVIEW_PATH);
          scrollRef.current?.scrollTo({ top: 0 });
        }}
        scrollClassName="px-3 pt-3 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]"
        footer={<PreviewBottomNav role={menuRole} />}
      >
        <div className="mx-auto w-full max-w-sm space-y-3" dir="rtl">
          <div className="sticky top-0 z-20 flex gap-2 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              aria-pressed={menuRole === "parent"}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${
                menuRole === "parent" ? "bg-[#001F3F] text-white" : "text-[#001F3F]"
              }`}
              onClick={() => {
                setMenuRole("parent");
                setMenuPath(PREVIEW_PATH);
              }}
            >
              תפריט הורה
            </button>
            <button
              type="button"
              aria-pressed={menuRole === "sitter"}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${
                menuRole === "sitter" ? "bg-[#001F3F] text-white" : "text-[#001F3F]"
              }`}
              onClick={() => {
                setMenuRole("sitter");
                setMenuPath(PREVIEW_PATH);
              }}
            >
              תפריט בייביסיטר
            </button>
          </div>
          <PreviewHome role={menuRole} />
          <details className="rounded-2xl border border-slate-200 bg-white p-3 text-right text-sm text-slate-700">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">בקרת תצוגה</summary>
            <p className="mt-2 text-[11px] leading-snug text-slate-600">
              מצב: {drawer.phase}
              <br />
              נתיב: {simulatedPath}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                className="rounded-xl bg-[#001F3F] px-3 py-2 text-xs font-semibold text-white"
                onClick={() =>
                  setSimulatedPath((current) => (current === PREVIEW_PATH ? PREVIEW_NEXT_PATH : PREVIEW_PATH))
                }
              >
                החלף נתיב מדומה
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-[#001F3F]"
                onClick={() => setBlocking(true)}
              >
                הצג חלון חוסם
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-[#001F3F]"
                onClick={() => setMenuPath(menuRole === "sitter" ? "/sitter/profile" : "/parent/profile")}
              >
                סמן אזור אישי
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-[#001F3F]"
                onClick={() => setMenuPath(menuRole === "sitter" ? "/sitter/settings" : "/parent/settings")}
              >
                סמן הגדרות
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-[#001F3F]"
                onClick={() => setTourSim("drawer")}
              >
                הדמיית סיור במגירה
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-[#001F3F]"
                onClick={() => setTourSim("messages")}
              >
                הדמיית סיור הודעות
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-[#001F3F]"
                onClick={() => setTourSim("off")}
              >
                נקה הדמיית סיור
              </button>
            </div>
          </details>
          {PARAGRAPHS.map((paragraph) => (
            <p key={paragraph} className="rounded-2xl bg-white px-4 py-3 text-sm leading-relaxed text-slate-600 shadow-sm">
              {paragraph}
            </p>
          ))}
        </div>
      </AppSideDrawerFrame>
      <PreviewDrawerLogout />

      {tourSim !== "off" ? (
        <div
          data-product-tour-overlay=""
          role="dialog"
          aria-modal="true"
          aria-label="הדמיית סיור"
          className="fixed bottom-24 right-3 z-[160] w-[min(16rem,calc(100vw-1.5rem))] rounded-2xl border border-[#001F3F]/10 bg-white p-3 text-right shadow-xl"
          dir="rtl"
        >
          <p className="text-xs font-bold text-[#001F3F]">הדמיית סיור</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-600">
            {tourSim === "drawer"
              ? "שלב האזור האישי פותח את המגירה כדי שהיעד יהיה על המסך."
              : "שלב ההודעות נשאר במסך, והמגירה נסגרת."}
          </p>
        </div>
      ) : null}

      {blocking ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dev-drawer-block-title"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-[#001F3F]/45 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-right shadow-xl" dir="rtl">
            <h2 id="dev-drawer-block-title" className="text-base font-bold text-[#001F3F]">
              חלון בדיקה
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              החלון הזה חוסם את המגירה. סגירה שלו מאפשרת לפתוח אותה שוב.
            </p>
            <button
              type="button"
              className="mt-4 rounded-xl bg-[#001F3F] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setBlocking(false)}
            >
              סגור
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
