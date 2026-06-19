import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * שירות ארנק דיגיטלי והתראות - מבודד לחלוטין מקוד הליבה
 */
export const walletService = {
  /**
   * שליפת היתרה הנוכחית של משתמש מתוך טבלת הפרופילים
   */
  async getBalance(userId: string): Promise<number> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching wallet balance:", error);
      return 0;
    }

    return data?.balance ?? 0;
  },

  /**
   * מנגנון האזנה בריל-טיים לשינויי יתרה בארנק
   * הפונקציה מקשיבה לטבלת profiles ומפעילה Callback בכל פעם שהיתרה משתנה.
   */
  subscribeToBalanceChanges(userId: string, onBalanceUpdate: (newBalance: number) => void) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return () => {};

    const channel = supabase
      .channel(`profile-balance-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new.balance !== "undefined") {
            onBalanceUpdate(payload.new.balance);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }
};