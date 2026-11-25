"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import {
  SITTER_BOOST_CHECKPOINT_LABELS,
  type SitterBoostCheckpointState,
  type SitterBoostProgress
} from "@/lib/sitter/profile-boost-progress";
import { useSitterProfileBoostProgress } from "@/lib/sitter/use-sitter-profile-boost-progress";

const RECOMMENDATIONS: { title: string; paragraphs: ReactNode[] }[] = [
  {
    title: "💬 תני למשפחות להכיר אותך באמת",
    paragraphs: [
      "ודאי שמילאת כמה שיותר מידע על עצמך: הניסיון שלך, הכישורים, ההעדפות וכל פרט שיכול לעזור להורים להכיר אותך טוב יותר.",
      "אל תשכחי לכתוב גם כמה מילים אישיות על עצמך. ספרי מי את, מה את אוהבת בעבודה עם ילדים ומה הופך אותך לבייביסיטרית שהורים ישמחו להכיר.",
      "לפעמים דווקא כמה משפטים אישיים הם מה שגורם למשפחה להתחבר לפרופיל שלך ולבחור דווקא בך!"
    ]
  },
  {
    title: "📸 תני פנים לפרופיל שלך",
    paragraphs: [
      "העלי תמונת פרופיל ברורה, נעימה ועדכנית, שבה אפשר לראות אותך היטב.",
      "אנחנו נוטים להתחבר למה שהעיניים שלנו רואות. תמונה טובה יוצרת היכרות ראשונית, מעניקה לפרופיל אופי אישי ועוזרת להורים להרגיש שהם כבר מכירים אותך קצת.",
      "תחשבי על זה: כשמשפחה עוברת בין כמה פרופילים, תמונה טובה יכולה להיות בדיוק מה שיגרום לה לעצור ולהכיר אותך."
    ]
  },
  {
    title: "📅 תני לסידור העבודה שלך לעבוד בשבילך",
    paragraphs: [
      <>
        בכל שבוע, הקדישי כמה דקות למילוי סידור העבודה שלך לשבוע הקרוב. סמני את הימים והשעות שבהם את פנויה, ואל תשכחי ללחוץ על <strong>״שמור״</strong>.
      </>,
      "סידור עבודה מעודכן עוזר לך לנהל את הזמינות שלך בצורה מסודרת, לתכנן את השבוע ולהימנע מהתחייבויות חופפות.",
      "כך תוכלי לדעת מתי את פנויה לקבל עבודות חדשות, ולהגיב במהירות לפניות שמתאימות ללוח הזמנים שלך.",
      "כמה דקות של עדכון בכל שבוע יעזרו לך להיות מוכנה להזדמנות העבודה הבאה!"
    ]
  },
  {
    title: "⭐ צברי דירוגים — כל כוכב חשוב!",
    paragraphs: [
      "בסיום משמרת דרך AnyNanny, המשפחה יכולה לדרג את החוויה שלה איתך.",
      "ככל שתצברי יותר דירוגים חיוביים, כך תוכלי להציג למשפחות חדשות היסטוריה עשירה יותר של עבודות מוצלחות והורים מרוצים.",
      "הדירוגים הם חלק מהמוניטין המקצועי שלך, והם יכולים לעזור למשפחות להרגיש בטוחות יותר כשהן שוקלות לפנות אלייך.",
      "כל משמרת מוצלחת היא הזדמנות לקבל עוד דירוג מצוין ולחזק את הפרופיל שלך!"
    ]
  },
  {
    title: "🤝 תגרמי למשפחה שאת כבר עובדת אצלה להשתמש ב־AnyNanny!",
    paragraphs: [
      <>
        את כבר עושה בייביסיטר למשפחה שמכירה אותך, סומכת עלייך ומזמינה אותך באופן קבוע? מעולה! <strong>זה בדיוק היתרון שאת יכולה לנצל כדי לקדם את עצמך.</strong>
      </>,
      "הציעי למשפחה להוריד את AnyNanny ולהמשיך להזמין אותך דרך האפליקציה.",
      "מבחינתך, את ממשיכה לעשות בדיוק את אותה עבודה, עם אותה משפחה ובאותם תנאים שאתם קובעים ביניכם. ההבדל הוא שעכשיו המשמרות מתועדות באפליקציה, ובסיומן תוכלי לקבל דירוגים וחוות דעת שיצטברו בפרופיל שלך.",
      "כך, גם עבודה עם משפחה שכבר מכירה אותך יכולה לעזור לך להתבלט בפני משפחות חדשות.",
      "למה לוותר על ההזדמנות להפוך את העבודה שאת כבר עושה למוניטין שיעזור לך להתקדם?"
    ]
  },
  {
    title: "✍️ חוות דעת — תני להורים מרוצים לספר עלייך!",
    paragraphs: [
      "דירוג בכוכבים הוא חשוב, אבל חוות דעת כתובה יכולה לספר למשפחות חדשות הרבה יותר.",
      "בסיום משמרת מוצלחת, עודדי את המשפחה לכתוב כמה מילים על החוויה שלה איתך.",
      "היא יכולה לספר על היחס שלך לילדים, האחריות, הסבלנות, המקצועיות או פשוט על כמה שהילדים נהנו בחברתך.",
      "משפחות אחרות יוכלו לקרוא את חוות הדעת האלה ולהתרשם ממך דרך הניסיון האמיתי של הורים שכבר נעזרו בשירותייך.",
      "לפעמים המלצה חמה ממשפחה אחת היא בדיוק מה שגורם למשפחה אחרת לבחור בך!"
    ]
  },
  {
    title: "🌟 המוניטין שלך ממשיך לעבוד בשבילך — גם כשהמשמרת נגמרת!",
    paragraphs: [
      "תזכרי, גם כשהילדים גדלים והמשפחה כבר לא צריכה בייביסיטר, הדירוגים וחוות הדעת שצברת דרך AnyNanny ממשיכים ללוות אותך.",
      "משפחות חדשות שרק הצטרפו לאפליקציה יכולות לגלות את הפרופיל שלך ולראות את הדירוגים, חוות הדעת והניסיון שצברת לאורך הדרך.",
      "במקום להתחיל בכל פעם מחדש ולשכנע משפחה שלא מכירה אותך, את מגיעה עם מוניטין שנבנה ממשמרת למשמרת.",
      "וזה היופי ב־AnyNanny: העבודה הטובה שאת עושה היום יכולה לעזור לך למצוא את המשפחה הבאה שלך מחר! 🚀"
    ]
  }
];

function Disclosure({
  title,
  children,
  className
}: {
  title: string;
  children: ReactNode;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className={className}>
      <h2>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2.5 text-right text-[15px] font-extrabold leading-snug text-[#001F3F]"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="min-w-0 flex-1">{title}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#0E9F6E] transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="space-y-2 border-t border-[#E4F3EA] px-3 py-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Tip({ title, paragraphs }: { title: string; paragraphs: ReactNode[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="overflow-hidden rounded-xl border border-[#D7EBE0] bg-[#F7FBF8]">
      <h3>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-2 text-right text-[13px] font-bold leading-snug text-[#001F3F]"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="min-w-0 flex-1">{title}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#0E9F6E] transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h3>
      {open ? (
        <div id={panelId} className="space-y-2 px-2.5 pb-2.5 text-right text-[13px] font-medium leading-relaxed text-[#243044]">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className={index >= paragraphs.length - 1 ? "font-bold" : undefined}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CheckpointBox({ state }: { state: SitterBoostCheckpointState }) {
  const done = state === "complete";
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border ${
        done ? "border-[#0E9F6E] bg-[#E8F8EF] text-[#0E9F6E]" : "border-[#C5D5CC] bg-white text-transparent"
      }`}
      aria-hidden
    >
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
    </span>
  );
}

function progressSummary(status: string, progress: SitterBoostProgress): string {
  if (status !== "ready") return "טוענים את ההתקדמות…";
  if (progress.checkpoints.some((state) => state === "unknown")) {
    return "חלק מהסעיפים לא ניתן לאמת כרגע.";
  }
  return `${progress.completed} מתוך ${progress.total} הושלמו`;
}

function checkpointLabel(state: SitterBoostCheckpointState): string {
  if (state === "complete") return "הושלם";
  if (state === "unknown") return "לא ניתן לאמת כרגע";
  return "טרם הושלם";
}

export function SitterProfileBoostScreen() {
  const [sitterId, setSitterId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void resolveBrowserAuth().then((auth) => {
      if (!cancelled) setSitterId(auth.ok ? auth.userId : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const { status, progress } = useSitterProfileBoostProgress(sitterId);
  return (
    <main className="mx-auto w-full min-w-0 max-w-sm space-y-3 overflow-x-hidden bg-[#F4F8FF] px-1 py-2" dir="rtl">
      <PageBackRow>
        <PageBackLink href="/sitter/dashboard" />
      </PageBackRow>
      <header className="space-y-2 px-1">
        <h1 className="text-right text-lg font-extrabold leading-snug text-[#001F3F]">🚀 תני בוסט לפרופיל שלך!</h1>
        <p className="text-right text-[13px] font-medium leading-relaxed text-[#243044]">
          רוצה שיותר משפחות יכירו אותך ויבחרו דווקא בך?
          <br />
          הכנו בשבילך כמה המלצות שיעזרו לך להבליט את הפרופיל שלך, לבנות אמון עם הורים ולהגדיל את הסיכוי לקבל יותר פניות.
        </p>
      </header>
      <Disclosure
        title="💡 המלצות לבוסט"
        className="overflow-hidden rounded-2xl border border-[#B7E4C7] bg-white shadow-[0_10px_22px_-18px_rgba(14,90,60,0.35)]"
      >
        {RECOMMENDATIONS.map((item) => (
          <Tip key={item.title} title={item.title} paragraphs={item.paragraphs} />
        ))}
        <div className="space-y-2 rounded-xl bg-[#F3FBF6] px-2.5 py-2.5 text-right text-[13px] font-bold leading-relaxed text-[#001F3F]">
          <p>💚 אז מה הסוד לפרופיל שבולט?</p>
          <p>תמונה טובה + פרופיל מלא + זמינות מעודכנת + דירוגים + חוות דעת.</p>
          <p className="font-medium">
            כל אחד מהצעדים האלה יכול לעזור למשפחות להכיר אותך טוב יותר, להתרשם מהניסיון שלך ולהרגיש בטוחות יותר כשהן בוחרות למי לפנות.
          </p>
          <p>הפרופיל שלך הוא הרבה יותר מכרטיס ביקור. הוא המוניטין המקצועי שאת בונה לעצמך — והוא ממשיך לגדול איתך!</p>
        </div>
      </Disclosure>
      <Disclosure
        title="✅ התקדמות בהשלמת הפרופיל"
        className="overflow-hidden rounded-2xl border border-[#B7E4C7] bg-white shadow-[0_10px_22px_-18px_rgba(14,90,60,0.35)]"
      >
        <Checklist status={status} progress={progress} />
      </Disclosure>
    </main>
  );
}

function Checklist({ status, progress }: { status: string; progress: SitterBoostProgress }) {
  return (
    <div className="space-y-3">
      <p className="text-right text-[13px] font-medium leading-relaxed text-[#243044]">
        ראית את הטבעת שמסביב לתמונת הפרופיל שלך?
        <br />
        היא מציגה את ההתקדמות שלך בהשלמת הפרופיל. ככל שתשלימי יותר פרטים, הטבעת תתמלא. ברשימה שלמטה תוכלי לראות מה כבר השלמת ומה עוד נשאר לך לעשות.
        <br />
        הסימון ✓ יופיע אוטומטית ליד כל סעיף שהשלמת.
      </p>
      <p className="text-right text-[13px] font-extrabold text-[#0E7A52]" aria-live="polite">
        {progressSummary(status, progress)}
      </p>
      <ul className="space-y-2">
        {SITTER_BOOST_CHECKPOINT_LABELS.map((label, index) => {
          const state = progress.checkpoints[index] ?? "unknown";
          return (
            <li key={label} className="flex items-start gap-2" aria-label={`${label} ${checkpointLabel(state)}`}>
              <CheckpointBox state={state} />
              <span className="min-w-0 flex-1 text-right text-[13px] font-medium leading-snug text-[#001F3F]">{label}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-right text-[13px] font-bold leading-relaxed text-[#001F3F]">
        כל צעד שאת משלימה מחזק את כרטיס הביקור שלך ועוזר למשפחות להכיר אותך טוב יותר.
      </p>
    </div>
  );
}
