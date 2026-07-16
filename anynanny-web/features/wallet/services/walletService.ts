import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

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
   * מנגנון האזנה בריל-טיים לשינויי יתרה בארנק.
   * Uses channel().on().subscribe() (never subscribe before on).
   */
  subscribeToBalanceChanges(
    userId: string,
    onBalanceUpdate: (newBalance: number) => void
  ): RealtimeChannel | null {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId.trim()) return null;

    return subscribePostgresChanges(supabase, `profile-balance-${userId}`, {
      event: "UPDATE",
      table: "profiles",
      filter: `id=eq.${userId}`,
      handler: (payload) => {
        const next = payload.new as { balance?: unknown } | null;
        if (next && typeof next.balance === "number") {
          onBalanceUpdate(next.balance);
        } else if (next && next.balance != null && Number.isFinite(Number(next.balance))) {
          onBalanceUpdate(Number(next.balance));
        }
      }
    });
  }
};
