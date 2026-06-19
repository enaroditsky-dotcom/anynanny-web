import { useEffect, useState } from "react";
import { walletService } from "../services/walletService";

/**
 * הוק חכם המאזין לשינויי ארנק בזמן אמת ומנהל את מצב ההתראה
 */
export function useWalletNotification(userId: string | undefined) {
  const [hasWalletUpdate, setHasWalletUpdate] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // הרשמה להאזנה בזמן אמת מול טבלת הפרופילים ב-Supabase
    const unsubscribe = walletService.subscribeToBalanceChanges(userId, (newBalance) => {
      console.log(`[Realtime Wallet Update] New balance detected: ${newBalance}`);
      
      // ברגע שהיתרה משתנה, נדליק את הנקודה האדומה בסרגל התחתון!
      setHasWalletUpdate(true);
    });

    // פונקציית ניקוי כאשר המשתמש עובר עמוד או מתנתק
    return () => {
      unsubscribe();
    };
  }, [userId]);

  return {
    hasWalletUpdate,
    clearWalletNotification: () => setHasWalletUpdate(false)
  };
}