/** Production-safe wallet view data until live wallet tables are enabled. */

export const MOCK_WALLET_BALANCE_ILS = 0;

export type ParentWalletTransaction = {
  id: string;
  type: "deposit" | "payment" | "refund";
  amount: number;
  description: string;
  created_at: string;
  status: "succeeded" | "pending" | "failed";
};

export type SitterWalletTransaction = {
  id: string;
  type: "earnings" | "payout" | "bonus";
  amount: number;
  description: string;
  created_at: string;
  status: "succeeded" | "pending" | "failed";
};

export type MockWalletView<TTransaction> = {
  balance: number;
  transactions: TTransaction[];
};

export function getMockParentWalletView(): MockWalletView<ParentWalletTransaction> {
  return {
    balance: MOCK_WALLET_BALANCE_ILS,
    transactions: []
  };
}

export function getMockSitterWalletView(): MockWalletView<SitterWalletTransaction> {
  return {
    balance: MOCK_WALLET_BALANCE_ILS,
    transactions: []
  };
}

export const WALLET_PREVIEW_MESSAGES = {
  parentDeposit:
    "הטענת ארנק תהיה זמינה בגרסה הבאה. כרגע ניתן לשלם ישירות בסיום משמרת.",
  parentPaymentMethods:
    "ניהול אמצעי תשלום יהיה זמין בגרסה הבאה.",
  sitterPayout:
    "משיכת כספים לבנק תהיה זמינה בגרסה הבאה. הרווחים יוצגו כאן לאחר הפעלת הארנק.",
  refresh: "היתרה מעודכנת לתצוגת הדגמה (₪0.00)."
} as const;

/** Brief client-only feedback for store-review-safe wallet actions. */
export async function runSafeWalletAction(
  actionKey: string,
  message: string,
  setActionLoading: (key: string | null) => void
): Promise<void> {
  setActionLoading(actionKey);
  await new Promise((resolve) => window.setTimeout(resolve, 280));
  window.alert(message);
  setActionLoading(null);
}
