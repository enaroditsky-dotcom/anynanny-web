export type HypCreateInput = {
    sumToBill: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string | null;
  };
  
  export type HypCreateResult = 
    | { ok: true; url: string }
    | { ok: false; error: string };
  
  export async function createHypTransaction(input: HypCreateInput): Promise<HypCreateResult> {
    // נתוני הסביבה שהגדרנו ב-.env.local
    const terminal = process.env.HYP_TERMINAL_ID;
    const passp = process.env.HYP_PASSP; // הוספתי אם נדרש ב-Payload
  
    const payload = {
      action: "addtoken", // פעולה סטנדרטית ב-Hyp ליצירת סליקה
      TerminalNumber: terminal,
      PassP: passp,
      Amount: input.sumToBill,
      Currency: 1, // 1 = ש"ח
      pageTrLayout: "mobile",
      MoreData: input.description,
      URLSuccess: input.successUrl,
      URLFailure: input.cancelUrl,
    };
  
    try {
      const response = await fetch("https://icar.hyp.co.il/hyp_add_token.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(payload as any).toString(),
      });
  
      const result = await response.text();
      
      // ב-Hyp לעיתים מקבלים את ה-URL בתוך התגובה או כ-Redirect
      if (result.includes("Error")) {
        return { ok: false, error: result };
      }
  
      return { ok: true, url: result }; // כאן ה-URL שהחזרנו
    } catch (error) {
      return { ok: false, error: "Hyp connection failed" };
    }
  }