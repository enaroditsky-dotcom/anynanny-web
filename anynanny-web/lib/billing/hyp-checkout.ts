export type HypCheckoutParams = {
    bookingId: string;
    amountNis: number;
    successUrl: string;
    paymentMethod: string;
    description: string;
  };
  
  export async function createHypCheckoutSession(params: HypCheckoutParams) {
    const payload = {
      TerminalNumber: process.env.HYP_TERMINAL_ID,
      ApiPass: process.env.HYP_PASSP,
      Amount: params.amountNis,
      Currency: "1",
      MoreData: params.bookingId,
      UrlSuccess: params.successUrl,
      UrlCancel: params.successUrl.replace("success", "cancel"),
      Description: params.description,
    };
  
    const response = await fetch("https://sandbox.hyp.co.il/api/v1/payment/create", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.HYP_API_KEY}` 
      },
      body: JSON.stringify(payload),
    });
  
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Hyp] API Error:", errorData);
      throw new Error(`Hyp payment initiation failed: ${response.statusText}`);
    }
  
    const data = await response.json();
    
    return {
      sessionId: data.TransactionId || Date.now().toString(),
      checkoutUrl: data.Url 
    };
  }