import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("=== Received Request inside API ===", body);

    const { amount, parentId, parentName } = body;

    // הגנה מעודכנת: מאפשרים לסכום להיות 0 (עבור טוקניזציה/אמצעי תשלום)
    if (amount === undefined || !parentId) {
      return NextResponse.json(
        { error: `פרמטרים חסרים. התקבל: amount=${amount}, parentId=${parentId}` }, 
        { status: 400 }
      );
    }

    const terminalNumber = process.env.CARDCOM_TERMINAL_NUMBER;
    const rawApiKey = process.env.CARDCOM_API_KEY; // מכיל את "apiName:apiPassword"

    if (!terminalNumber || !rawApiKey) {
      return NextResponse.json({ error: "פרטי מסוף או מפתח API חסרים בשרת" }, { status: 500 });
    }

    // פירוק בטוח ונקי של ה-Name וה-Password מתוך ה-env (בלי גרשיים מיותרים)
    const [apiName, apiPassword] = rawApiKey.replace(/"/g, "").split(":");

    // בניית המבנה הרשמי והנכון לפרופיל נמוך בגרסה v5 של קארדקום
    const cardcomPayload: any = {
      terminalNumber: Number(terminalNumber),
      apiName: apiName,
      apiPassword: apiPassword,
      amount: Number(amount),
      currency: 1, // ש"ח
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/parent/wallet?status=success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/parent/wallet?status=cancel`,
      languages: "he",
      customerName: parentName || "הורה AnyNanny",
      customFields: {
        customField1: parentId
      }
    };

    // אם הסכום הוא 0, מדובר ברישום כרטיס / בדיקה בלבד ללא הפקת חשבונית
    if (Number(amount) === 0) {
      cardcomPayload.operation = 2; // 2 = Create Token Only / Tokenization
    } else {
      cardcomPayload.documentType = 2; // 2 = קבלה
    }

    console.log("Sending payload to Cardcom domain with updated structural keys...");

    // התיקון הקריטי: מעבר לדומיין ה-API הרשמי ובאותיות קטנות (lowprofile/create) כדי למנוע שגיאת 404
    const response = await fetch("https://api.cardcom.solutions/v5/lowprofile/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cardcomPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Cardcom Rejected fully:", result);
      return NextResponse.json(
        { error: result.message || "שרת קארדקום דחה את בקשת הסליקה. ודא שההגדרות תואמות למסוף." }, 
        { status: 500 }
      );
    }

    return NextResponse.json({ url: result.url });

  } catch (error: any) {
    console.error("Critical Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}