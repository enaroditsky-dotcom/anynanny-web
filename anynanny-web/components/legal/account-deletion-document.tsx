import { LegalParagraph } from "@/components/legal/legal-text";
import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";

const legalLinkClass =
  "font-semibold text-navy-header underline decoration-navy-header/30 underline-offset-2";

export function AccountDeletionDocument() {
  return (
    <article className="space-y-8 text-right leading-relaxed text-navy-900">
      <header className="space-y-2 border-b border-navy-header/10 pb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">AnyNanny</p>
        <h1 className="text-2xl font-bold text-navy-header">מחיקת חשבון AnyNanny</h1>
      </header>

      <section aria-labelledby="delete-account-intro">
        <h2 id="delete-account-intro" className="sr-only">
          מבוא
        </h2>
        <div className="space-y-3 text-sm text-slate-700">
          <LegalParagraph text="ב-AnyNanny ניתן לבקש למחוק את החשבון ואת המידע האישי המשויך אליו." />
        </div>
      </section>

      <section aria-labelledby="delete-account-in-app">
        <h2 id="delete-account-in-app" className="text-base font-bold text-navy-header">
          מחיקה מתוך AnyNanny
        </h2>
        <div className="mt-3 space-y-3 text-sm text-slate-700">
          <LegalParagraph text="אם עדיין יש לך גישה לחשבון, ניתן להתחיל את תהליך המחיקה ישירות מתוך AnyNanny:" />
          <p className="font-semibold text-navy-header">הגדרות → מחיקת חשבון לצמיתות</p>
          <LegalParagraph text="לאחר אישור הפעולה, בקשת המחיקה תטופל בהתאם למנגנון מחיקת החשבון ולמדיניות הפרטיות של AnyNanny." />
        </div>
      </section>

      <section aria-labelledby="delete-account-no-access">
        <h2 id="delete-account-no-access" className="text-base font-bold text-navy-header">
          אין לך גישה לחשבון?
        </h2>
        <div className="mt-3 space-y-3 text-sm text-slate-700">
          <LegalParagraph text="ניתן לשלוח בקשת מחיקת חשבון לכתובת:" />
          <p>
            <a href={`mailto:${ANYNANNY_SUPPORT_EMAIL}`} className={`${legalLinkClass} break-all text-base`}>
              {ANYNANNY_SUPPORT_EMAIL}
            </a>
          </p>
          <LegalParagraph text="יש לשלוח את הבקשה מכתובת האימייל המשויכת לחשבון ולציין כי ברצונך למחוק את חשבון AnyNanny." />
        </div>
      </section>

      <section aria-labelledby="delete-account-data">
        <h2 id="delete-account-data" className="text-base font-bold text-navy-header">
          מה קורה למידע שלי?
        </h2>
        <div className="mt-3 space-y-3 text-sm text-slate-700">
          <LegalParagraph text="כחלק מתהליך מחיקת החשבון, פרטי החשבון והמידע האישי המשויך אליו נמחקים או מנותקים מהחשבון בהתאם למבנה המערכת ולמדיניות הפרטיות של AnyNanny." />
          <LegalParagraph text="מידע מסוים עשוי להישמר לתקופה הנדרשת כאשר קיימת חובה חוקית, חשבונאית או אבטחתית, או לצורך מניעת הונאה, טיפול בתשלומים ובמחלוקות והגנה על זכויות משתמשים ו-AnyNanny." />
          <p>
            למידע נוסף ניתן לעיין ב<a href="/privacy" className={legalLinkClass}>מדיניות הפרטיות</a>.
          </p>
        </div>
      </section>

      <nav aria-label="מסמכים משפטיים" className="space-y-2 border-t border-navy-header/10 pt-6 text-sm">
        <p>
          <a href="/privacy" className={legalLinkClass}>
            מדיניות הפרטיות
          </a>
        </p>
        <p>
          <a href="/terms" className={legalLinkClass}>
            תנאי השימוש
          </a>
        </p>
      </nav>
    </article>
  );
}
