import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// שימוש ב-Admin Client כדי לעקוף חוקי RLS ולאפשר לשרת לעדכן את היתרה בצורה אמינה
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    // 1. קריאת הנתונים שמגיעים מה-API של Cardcom/Hyp
    const contentType = request.headers.get("content-type") || "";
    let rawData: any = {};

    if (contentType.includes("application/json")) {
      rawData = await request.json();
    } else {
      const formData = await request.formData();
      rawData = Object.fromEntries(formData.entries());
    }

    console.log("=== Received Cardcom Webhook ===", rawData);

    // התאמת שדות לפרוטוקול API v5 / v4 Callbacks
    const terminalNumber = rawData.TerminalNumber?.toString() || rawData.terminalNumber?.toString();
    const responseCode = rawData.ResponseCode?.toString() || rawData.responseCode?.toString(); // "0" או "00" פירושו הצלחה
    const amount = parseFloat(rawData.Sum || rawData.Amount || rawData.amount || "0");
    const cardcomInvoiceNumber = rawData.InternalDealNumber || rawData.DocNumber || "0";

    // שליפת ה-parentId מתוך ה-customFields ששתלנו בבקשה
    const parentId = rawData.customField1 || (rawData.customFields && rawData.customFields.customField1) || rawData.ReturnValue;

    // 2. אבטחה ואימות של ה-Webhook מול המסוף שלך
    const expectedTerminal = process.env.CARDCOM_TERMINAL_NUMBER || "040617649";
    if (terminalNumber !== expectedTerminal) {
      console.error(`Unauthorized Webhook source: Terminal mismatch. Got ${terminalNumber}, expected ${expectedTerminal}`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3. בדיקה אם העסקה אכן הצליחה (0 או 00 בקארדקום זה תקין)
    if (responseCode !== "0" && responseCode !== "00") {
      console.warn(`Cardcom transaction failed with response code: ${responseCode}`);
      return NextResponse.json({ message: "Transaction failure logged" }, { status: 200 });
    }

    if (!parentId || isNaN(amount) || amount <= 0) {
      console.error("Missing critical data in Webhook:", { parentId, amount });
      return NextResponse.json({ error: "Incomplete data" }, { status: 400 });
    }

    console.log(`Processing successful Israeli payment. Parent: ${parentId}, Amount: ₪${amount}`);

    // 4. שליפת היתרה הנוכחית של ההורה
    const { data: currentWallet, error: walletError } = await supabaseAdmin
      .from("parent_wallet_balances")
      .select("balance")
      .eq("parent_id", parentId)
      .maybeSingle();

    if (walletError) {
      console.error("Failed to fetch balance during webhook:", walletError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const currentBalance = currentWallet?.balance || 0;
    const newBalance = currentBalance + amount;

    // 5. עדכון היתרה החדשה (Upsert)
    const { error: updateError } = await supabaseAdmin
      .from("parent_wallet_balances")
      .upsert({
        parent_id: parentId,
        balance: newBalance,
        updated_at: new Date().toISOString(),
      }, { onConflict: "parent_id" });

    if (updateError) {
      console.error("Failed to update wallet balance:", updateError);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    // 6. תיעוד הפעולה בטבלת היסטוריית התנועות (billing_transactions)
    const { error: txError } = await supabaseAdmin
      .from("billing_transactions")
      .insert({
        parent_id: parentId,
        type: "deposit",
        amount: amount,
        description: `טעינת ארנק מוצלח (Hyp #${cardcomInvoiceNumber})`,
        status: "succeeded",
        created_at: new Date().toISOString(),
      });

    if (txError) {
      console.error("Failed to log billing transaction:", txError);
    }

    return NextResponse.json({ status: "success", message: "Wallet updated successfully" }, { status: 200 });

  } catch (error: any) {
    console.error("Critical error in Israel Webhook handler:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}