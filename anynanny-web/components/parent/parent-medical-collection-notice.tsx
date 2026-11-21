import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";

/** Shown where the required medical yes/no is collected. Free text stays optional. */
export function ParentMedicalCollectionNotice() {
  return (
    <p className="text-xs leading-relaxed text-slate-600">
      בקר המידע הוא אדוארד נרודיצקי (Edward Naroditsky). אפשר לפנות אליו בכתובת{" "}
      <a className="underline" href={`mailto:${ANYNANNY_SUPPORT_EMAIL}`}>
        {ANYNANNY_SUPPORT_EMAIL}
      </a>
      . אין חובה שבדין למסור את התשובה. היא נשמרת כדי לדעת אם יש לילד אלרגיה, מצב רפואי, צורך מיוחד או מידע טיפולי שחשוב לחשבון. בלי תשובת כן או לא אי אפשר לסיים את השלב הזה. הפירוט החופשי אינו חובה. הוא נשמר בחשבון ההורה בלבד, אינו מוצג בחיפוש או בתצוגה המקדימה, ואינו נשלח אוטומטית לבייביסיטר. אפשר לבקש עיון או תיקון באותה כתובת.
    </p>
  );
}
