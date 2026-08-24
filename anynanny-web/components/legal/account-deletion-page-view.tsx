"use client";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { LegalParagraph } from "@/components/legal/legal-text";
import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";

const EMAIL_REQUEST_TEXT = `אם אין באפשרותך להיכנס לחשבון, ניתן לבקש מחיקת חשבון באמצעות פנייה ל:\n${ANYNANNY_SUPPORT_EMAIL}`;

export function AccountDeletionPageView() {
  return (
    <LegalDocumentPage title="מחיקת חשבון">
      <article className="space-y-8 text-right leading-relaxed text-navy-900">
        <header className="space-y-2 border-b border-navy-header/10 pb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">AnyNanny</p>
          <h1 className="text-2xl font-bold text-navy-header">מחיקת חשבון AnyNanny</h1>
        </header>

        <div className="space-y-3 text-sm text-slate-700">
          <LegalParagraph text="משתמשים רשומים יכולים למחוק את חשבונם ישירות מתוך האפליקציה:" />
          <p className="font-semibold text-navy-header">הגדרות {">"} מחק חשבון לצמיתות</p>
          <LegalParagraph text="לאחר אישור המחיקה, תהליך מחיקת החשבון והמידע המשויך אליו מתבצע בהתאם למדיניות הפרטיות של AnyNanny." />
          <LegalParagraph text={EMAIL_REQUEST_TEXT} />
          <LegalParagraph text="לצורכי אבטחה, ייתכן שנבקש לאמת את זהות בעל החשבון לפני טיפול בבקשה." />
          <LegalParagraph text="מידע מסוים עשוי להישמר כאשר הדבר נדרש לצורך עמידה בדרישות חוקיות, מניעת הונאה, טיפול במחלוקות או שמירת רישומי עסקאות ותשלומים, בהתאם למדיניות הפרטיות." />
          <p>
            <a
              href="/privacy"
              className="font-semibold text-navy-header underline decoration-navy-header/30 underline-offset-2"
            >
              מדיניות הפרטיות
            </a>
          </p>
        </div>
      </article>
    </LegalDocumentPage>
  );
}
