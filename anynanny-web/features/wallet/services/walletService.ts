import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

const PARENT_WALLET_BALANCES_TABLE = "parent_wallet_balances" as const;
const SITTER_WALLET_BALANCES_TABLE = "sitter_wallet_balances" as const;

/**
 * Wallet realtime helpers — isolated from core shift logic.
 * Parent balances live on `parent_wallet_balances` (not `profiles.balance`).
 */
export const walletService = {
  async getBalance(userId: string, role: "parent" | "sitter" = "parent"): Promise<number> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId.trim()) return 0;

    if (role === "sitter") {
      const { data, error } = await supabase
        .from(SITTER_WALLET_BALANCES_TABLE)
        .select("balance")
        .eq("sitter_id", userId)
        .maybeSingle();
      if (error) return 0;
      return Number((data as { balance?: unknown } | null)?.balance) || 0;
    }

    const { data, error } = await supabase
      .from(PARENT_WALLET_BALANCES_TABLE)
      .select("balance")
      .eq("parent_id", userId)
      .maybeSingle();

    if (error) return 0;
    return Number((data as { balance?: unknown } | null)?.balance) || 0;
  },

  /**
   * Listen for parent wallet balance updates.
   * Uses channel().on().subscribe() (never subscribe before on).
   */
  subscribeToBalanceChanges(
    userId: string,
    onBalanceUpdate: (newBalance: number) => void,
    role: "parent" | "sitter" = "parent"
  ): RealtimeChannel | null {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId.trim()) return null;

    if (role === "sitter") {
      return subscribePostgresChanges(
        supabase,
        `sitter-wallet-balance-${userId}`,
        {
          event: "*",
          table: SITTER_WALLET_BALANCES_TABLE,
          filter: `sitter_id=eq.${userId}`,
          handler: (payload) => {
            const next = (payload.new ?? payload.old) as { balance?: unknown } | null;
            if (next && next.balance != null && Number.isFinite(Number(next.balance))) {
              onBalanceUpdate(Number(next.balance));
            } else {
              onBalanceUpdate(0);
            }
          }
        },
        undefined,
        { maxRetries: 3 }
      );
    }

    return subscribePostgresChanges(
      supabase,
      `parent-wallet-balance-${userId}`,
      {
        event: "*",
        table: PARENT_WALLET_BALANCES_TABLE,
        filter: `parent_id=eq.${userId}`,
        handler: (payload) => {
          const next = (payload.new ?? payload.old) as { balance?: unknown } | null;
          if (next && next.balance != null && Number.isFinite(Number(next.balance))) {
            onBalanceUpdate(Number(next.balance));
          } else {
            onBalanceUpdate(0);
          }
        }
      },
      undefined,
      { maxRetries: 3 }
    );
  }
};
